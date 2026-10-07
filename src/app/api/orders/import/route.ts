export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agencies, clients, orderItems, orders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { NOTIFICATION_EVENTS, notifyRoles } from "@/lib/notifications";
import { generateOrderNumber } from "@/lib/order-number";
import {
  ORDER_IMPORT_FIELDS,
  normalizeImportHeader,
  suggestOrderImportMapping,
} from "@/lib/order-import-fields";
import { inferCommercialStatusFromExcel, inferProductionStatusFromExcel, normalizeExcelFillColor } from "@/lib/order-import-colors";

type Merge = { s: { r: number; c: number }; e: { r: number; c: number } };
type WorksheetLike = { [key: string]: unknown; "!merges"?: Merge[]; "!rows"?: unknown[]; "!ref"?: string };
type ParsedSheet = {
  index: number;
  name: string;
  headerRow: number;
  headers: string[];
  rows: string[][];
  rowColors: (string | null)[];
  mapping: Record<string, string>;
};

type ImportRow = { sheet: ParsedSheet; rowIndex: number; cells: string[] };
type ImportGroup = { key: string; orderNumber: string; rows: ImportRow[] };

const MAX_BYTES = 25 * 1024 * 1024;
const HEADER_WORDS = ["commande", "client", "agence", "article", "qte", "quantite", "date", "priorite", "affaire", "production", "livraison", "reste", "note", "lentille", "driver"];

function cellText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function excelDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getDate()).padStart(2, "0")}/${String(value.getMonth() + 1).padStart(2, "0")}/${value.getFullYear()}`;
  }
  if (typeof value === "number" && value > 59 && value < 100000) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(date.getTime())) return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
  }
  return cellText(value);
}

function headerScore(row: unknown[]): number {
  let matches = 0;
  let values = 0;
  for (const value of row) {
    const header = normalizeImportHeader(value);
    if (!header) continue;
    values++;
    if (HEADER_WORDS.some((word) => header.includes(normalizeImportHeader(word)))) matches++;
  }
  return matches > 0 ? matches * 100 + values : -1;
}

function findHeaderIndex(matrix: unknown[][]): number {
  let best = -1;
  let score = 0;
  for (let index = 0; index < Math.min(40, matrix.length); index++) {
    const candidate = headerScore(matrix[index] || []);
    if (candidate > score) { score = candidate; best = index; }
  }
  return best;
}

function mergeCells(matrix: unknown[][], sheet: WorksheetLike) {
  const merges = sheet["!merges"] || [];
  if (merges.length === 0) return;
  let originRow = 0;
  let originColumn = 0;
  if (typeof sheet["!ref"] === "string") {
    const match = /^([A-Z]+)(\d+):/.exec(sheet["!ref"]);
    if (match) originRow = Number(match[2]) - 1;
    if (match) originColumn = match[1].split("").reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
  }
  for (const merge of merges) {
    const firstRow = merge.s.r - originRow;
    const lastRow = merge.e.r - originRow;
    const firstColumn = merge.s.c - originColumn;
    const lastColumn = merge.e.c - originColumn;
    const value = matrix[firstRow]?.[firstColumn];
    if (value === undefined || value === null || cellText(value) === "") continue;
    for (let row = firstRow; row <= lastRow && row < matrix.length; row++) {
      if (!matrix[row]) matrix[row] = [];
      for (let column = firstColumn; column <= lastColumn; column++) {
        if (matrix[row][column] === undefined || cellText(matrix[row][column]) === "") matrix[row][column] = value;
      }
    }
  }
}

function worksheetCellValue(cell: unknown): unknown {
  if (!cell || typeof cell !== "object") return "";
  const record = cell as Record<string, unknown>;
  if (record.v !== undefined && record.v !== null) return record.v;
  if (record.w !== undefined && record.w !== null) return record.w;
  return record.f ? String(record.f) : "";
}

function cellFillColor(cell: unknown): string | null {
  if (!cell || typeof cell !== "object") return null;
  const record = cell as Record<string, unknown>;
  const candidates: unknown[] = [record, record.s, record.style, record.fill];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const style = candidate as Record<string, unknown>;
    const nestedFill = style.fill && typeof style.fill === "object" ? style.fill as Record<string, unknown> : null;
    const colors = [style.fgColor, style.bgColor, style.color, nestedFill?.fgColor, nestedFill?.bgColor];
    for (const color of colors) {
      if (typeof color === "string") {
        const normalized = normalizeExcelFillColor(color);
        if (normalized) return normalized;
      }
      if (color && typeof color === "object") {
        const colorRecord = color as Record<string, unknown>;
        for (const key of ["rgb", "argb", "hex", "value"]) {
          const normalized = normalizeExcelFillColor(colorRecord[key]);
          if (normalized) return normalized;
        }
      }
    }
  }
  return null;
}

function worksheetRowColor(worksheet: WorksheetLike, row: number): string | null {
  return cellFillColor(worksheet["!rows"]?.[row]);
}

function worksheetCellColor(
  XLSX: typeof import("xlsx"),
  worksheet: WorksheetLike,
  row: number,
  column: number,
): string | null {
  let sourceRow = row;
  let sourceColumn = column;
  for (const merge of worksheet["!merges"] || []) {
    if (row >= merge.s.r && row <= merge.e.r && column >= merge.s.c && column <= merge.e.c) {
      sourceRow = merge.s.r;
      sourceColumn = merge.s.c;
      break;
    }
  }
  const address = XLSX.utils.encode_cell({ r: sourceRow, c: sourceColumn });
  return cellFillColor(worksheet[address]);
}

function parseSheet(XLSX: typeof import("xlsx"), name: string, index: number, worksheet: WorksheetLike): ParsedSheet | null {
  const range = typeof worksheet["!ref"] === "string" ? XLSX.utils.decode_range(worksheet["!ref"] as string) : null;
  if (!range) return null;
  const matrix: unknown[][] = [];
  const rowPresence: boolean[] = [];
  for (let actualRow = range.s.r; actualRow <= range.e.r; actualRow++) {
    const row: unknown[] = [];
    let present = false;
    for (let actualColumn = range.s.c; actualColumn <= range.e.c; actualColumn++) {
      const address = XLSX.utils.encode_cell({ r: actualRow, c: actualColumn });
      const cell = worksheet[address];
      const value = worksheetCellValue(cell);
      row.push(value);
      if (value !== "" || cellFillColor(cell) !== null) present = true;
    }
    if (worksheetRowColor(worksheet, actualRow) !== null) present = true;
    matrix.push(row);
    rowPresence.push(present);
  }
  if (matrix.length === 0) return null;
  mergeCells(matrix, worksheet);
  const headerRow = findHeaderIndex(matrix);
  if (headerRow < 0) return null;

  const rawHeaders = (matrix[headerRow] || []).map(cellText);
  let width = rawHeaders.length;
  for (let row = headerRow + 1; row < matrix.length; row++) width = Math.max(width, matrix[row]?.length || 0);
  while (width > 0 && rawHeaders[width - 1] === "" && matrix.slice(headerRow + 1).every((row) => cellText(row[width - 1]) === "")) width--;
  if (width === 0) return null;

  const headers = Array.from({ length: width }, (_, column) => rawHeaders[column] || `Colonne ${column + 1}`);
  const mapping = suggestOrderImportMapping(headers);
  const orderNumberColumn = mapping.orderNumber ? headers.findIndex((header) => header === mapping.orderNumber) : -1;
  const originRow = range.s.r;
  const originColumn = range.s.c;
  const dateColumns = new Set(headers.map((header, column) => normalizeImportHeader(header).includes("date") ? column : -1).filter((column) => column >= 0));
  const rows: string[][] = [];
  const rowColors: (string | null)[] = [];
  for (let row = headerRow + 1; row < matrix.length; row++) {
    const values = Array.from({ length: width }, (_, column) => dateColumns.has(column) ? excelDate(matrix[row]?.[column]) : cellText(matrix[row]?.[column]));
    // Une ligne qui contient uniquement une couleur/style est conservée pour
    // ne pas perdre une ligne historique visuellement renseignée.
    if (values.every((value) => value === "") && !rowPresence[row]) continue;
    rows.push(values);
    const actualRow = originRow + row;
    const preferredColor = orderNumberColumn >= 0
      ? worksheetCellColor(XLSX, worksheet, actualRow, originColumn + orderNumberColumn)
      : null;
    const rowColor = preferredColor || worksheetRowColor(worksheet, actualRow) || Array.from({ length: width }, (_, column) =>
      worksheetCellColor(XLSX, worksheet, originRow + row, originColumn + column),
    ).find((color) => color !== null) || null;
    rowColors.push(rowColor);
  }
  propagateOrderFields(rows, headers, mapping);
  return { index, name, headerRow, headers, rows, rowColors, mapping };
}

async function readWorkbook(file: File): Promise<ParsedSheet[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", cellDates: true, cellStyles: true, raw: true });
  const sheets: ParsedSheet[] = [];
  workbook.SheetNames.forEach((name, index) => {
    const worksheet = workbook.Sheets[name] as unknown as WorksheetLike;
    const parsed = parseSheet(XLSX, name, index, worksheet);
    if (parsed) sheets.push(parsed);
  });
  return sheets;
}

function propagateOrderFields(
  rows: string[][],
  headers: string[],
  mapping: Record<string, string>,
) {
  const carryKeys = ["orderNumber", "client", "agency", "affaire", "commercialStatus", "productionStatus"];
  const columns = new Map<string, number>();
  for (const key of carryKeys) {
    const source = mapping[key];
    const column = source ? headers.findIndex((header) => header === source || normalizeImportHeader(header) === normalizeImportHeader(source)) : -1;
    if (column >= 0) columns.set(key, column);
  }
  const articleColumn = mapping.articleName ? headers.findIndex((header) => header === mapping.articleName || normalizeImportHeader(header) === normalizeImportHeader(mapping.articleName)) : -1;
  const quantityColumn = mapping.quantity ? headers.findIndex((header) => header === mapping.quantity || normalizeImportHeader(header) === normalizeImportHeader(mapping.quantity)) : -1;
  const carried: Record<string, string> = {};
  for (const row of rows) {
    const hasArticleData = (articleColumn >= 0 && cellText(row[articleColumn]) !== "") || (quantityColumn >= 0 && cellText(row[quantityColumn]) !== "");
    if (!hasArticleData) continue;
    for (const [key, column] of columns) {
      const value = cellText(row[column]);
      if (value) carried[key] = value;
      else if (carried[key]) row[column] = carried[key];
    }
  }
}

function sourceValue(row: ImportRow, key: string, mapping: Record<string, string>): string {
  const sourceHeader = mapping[key] || row.sheet.mapping[key];
  if (!sourceHeader) return "";
  const column = row.sheet.headers.findIndex((header) => header === sourceHeader || normalizeImportHeader(header) === normalizeImportHeader(sourceHeader));
  return column >= 0 ? row.cells[column] || "" : "";
}

function parseNumber(value: string, fallback = 0): number {
  const normalized = String(value || "").replace(/\s/g, "").replace(/,(?=\d{1,2}$)/, ".").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDate(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString().slice(0, 10);
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const fr = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(raw);
  if (fr) return `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function normalizePriority(value: string): string {
  const normalized = normalizeImportHeader(value).toUpperCase();
  if (/^P([1-9]|10)$/.test(normalized)) return normalized;
  if (normalized.includes("tresurgent")) return "TRES_URGENTE";
  if (normalized.includes("urgent")) return "URGENTE";
  if (normalized.includes("prevision")) return "PREVISION";
  return "NORMALE";
}

function makeCode(value: string, prefix: string, used: Set<string>): string {
  const base = normalizeImportHeader(value).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 18) || prefix;
  let code = base;
  let suffix = 2;
  while (used.has(code)) code = `${base.slice(0, 15)}${suffix++}`;
  used.add(code);
  return code;
}

function registerReference<T extends { id: number }>(map: Map<string, T>, ambiguous: Set<string>, value: T, raw: string) {
  const key = normalizeImportHeader(raw);
  if (!key || ambiguous.has(key)) return;
  const existing = map.get(key);
  if (existing && existing.id !== value.id) {
    map.delete(key);
    ambiguous.add(key);
    return;
  }
  map.set(key, value);
}

function previewResponse(sheets: ParsedSheet[]) {
  const allHeaders = [...new Set(sheets.flatMap((sheet) => sheet.headers))];
  const mapping = suggestOrderImportMapping(allHeaders);
  const missing = ORDER_IMPORT_FIELDS.filter((field) => field.required && !mapping[field.key]).map((field) => field.label);
  return {
    fields: ORDER_IMPORT_FIELDS.filter((field) => field.importable !== false).map(({ key, label, required }) => ({ key, label, required: !!required })),
    mapping,
    sheets: sheets.map((sheet) => ({
      index: sheet.index,
      name: sheet.name,
      headerRow: sheet.headerRow + 1,
      headers: sheet.headers,
      rowCount: sheet.rows.length,
      mapping: sheet.mapping,
      sample: sheet.rows.slice(0, 8),
      sampleColors: sheet.rowColors.slice(0, 8),
      colorSummary: [...sheet.rowColors.reduce((counts, color) => {
        if (color) counts.set(color, (counts.get(color) || 0) + 1);
        return counts;
      }, new Map<string, number>())].map(([color, count]) => ({ color, count })),
    })),
    warnings: missing.length > 0 ? [`Colonnes obligatoires non détectées : ${missing.join(", ")}`] : [],
  };
}

export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!["superadmin", "commercial"].includes(user.role)) return NextResponse.json({ error: "Import réservé au commercial et au superadmin" }, { status: 403 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Fichier Excel requis" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Fichier trop volumineux (25 Mo maximum)" }, { status: 400 });

    const sheets = await readWorkbook(file);
    if (sheets.length === 0) return NextResponse.json({ error: "Aucune feuille Excel exploitable : vérifiez la ligne d'en-tête" }, { status: 400 });
    const mode = String(form.get("mode") || "preview");
    if (mode === "preview") return NextResponse.json(previewResponse(sheets));

    let mapping: Record<string, string> = {};
    try { mapping = JSON.parse(String(form.get("mapping") || "{}")) as Record<string, string>; } catch { return NextResponse.json({ error: "Mappage invalide" }, { status: 400 }); }
    const selectedIndexes = JSON.parse(String(form.get("sheetIndexes") || "[]")) as number[];
    const selectedSheets = selectedIndexes.length > 0 ? sheets.filter((sheet) => selectedIndexes.includes(sheet.index)) : sheets;
    const createMissing = String(form.get("createMissing") || "0") === "1";
    const duplicateMode = String(form.get("duplicateMode") || "skip");
    const requiredKeys = ["orderNumber", "client", "agency", "articleName", "quantity"];
    const missingKeys = requiredKeys.filter((key) => !mapping[key]);
    if (missingKeys.length > 0) return NextResponse.json({ error: `Mappage incomplet : ${missingKeys.join(", ")}` }, { status: 400 });

    const allClients = await db.select().from(clients);
    const allAgencies = await db.select().from(agencies);
    const clientsByValue = new Map<string, typeof allClients[number]>();
    const agenciesByValue = new Map<string, typeof allAgencies[number]>();
    const ambiguousClients = new Set<string>();
    const ambiguousAgencies = new Set<string>();
    const clientCodes = new Set<string>();
    const agencyCodes = new Set<string>();
    for (const client of allClients) {
      registerReference(clientsByValue, ambiguousClients, client, client.name);
      registerReference(clientsByValue, ambiguousClients, client, client.code);
      clientCodes.add(client.code);
    }
    for (const agency of allAgencies) {
      registerReference(agenciesByValue, ambiguousAgencies, agency, agency.name);
      registerReference(agenciesByValue, ambiguousAgencies, agency, agency.code);
      agencyCodes.add(agency.code);
    }

    const groups = new Map<string, ImportGroup>();
    const rejectedRows: { row: ImportRow; reason: string }[] = [];
    for (const sheet of selectedSheets) {
      sheet.rows.forEach((cells, rowIndex) => {
        const row = { sheet, rowIndex, cells };
        const number = sourceValue(row, "orderNumber", mapping).trim();
        if (!number) {
          rejectedRows.push({ row, reason: "Numéro de commande vide" });
          return;
        }
        const key = `number:${number}`;
        const group = groups.get(key) || { key, orderNumber: number, rows: [] };
        group.rows.push(row);
        groups.set(key, group);
      });
    }

    const imported: { orderNumber: string; items: number }[] = [];
    const skipped: { orderNumber: string; reason: string }[] = [];
    const warnings: string[] = rejectedRows.map(({ row, reason }) => `${row.sheet.name}, ligne ${row.sheet.headerRow + row.rowIndex + 2} : ${reason}`);
    let createdClients = 0;
    let createdAgencies = 0;

    for (const group of groups.values()) {
      const first = group.rows[0];
      const clientValue = sourceValue(first, "client", mapping).trim();
      const agencyValue = sourceValue(first, "agency", mapping).trim();
      const groupColor = group.rows
        .map((row) => row.sheet.rowColors[row.rowIndex])
        .find((color): color is string => color !== null && color !== undefined);
      const commercialValue = sourceValue(first, "commercialStatus", mapping) || sourceValue(first, "productionStatus", mapping);
      const status = inferCommercialStatusFromExcel(commercialValue, groupColor);
      if (!clientValue) { skipped.push({ orderNumber: group.orderNumber, reason: "Client vide" }); continue; }
      if (!agencyValue) { skipped.push({ orderNumber: group.orderNumber, reason: "Agence vide" }); continue; }
      const inconsistentReference = group.rows.some((row) =>
        normalizeImportHeader(sourceValue(row, "client", mapping)) !== normalizeImportHeader(clientValue)
        || normalizeImportHeader(sourceValue(row, "agency", mapping)) !== normalizeImportHeader(agencyValue),
      );
      if (inconsistentReference) {
        skipped.push({ orderNumber: group.orderNumber, reason: "Client ou agence ambigu entre les lignes" });
        warnings.push(`Commande ${group.orderNumber} ignorée : client/agence différents selon les lignes.`);
        continue;
      }

      const clientKey = normalizeImportHeader(clientValue);
      if (ambiguousClients.has(clientKey)) {
        skipped.push({ orderNumber: group.orderNumber, reason: `Client ambigu : ${clientValue}` });
        continue;
      }
      let client = clientsByValue.get(clientKey);
      if (!client && createMissing) {
        const code = makeCode(clientValue, "CLIENT", clientCodes);
        [client] = await db.insert(clients).values({ name: clientValue, code }).returning();
        registerReference(clientsByValue, ambiguousClients, client, client.name);
        registerReference(clientsByValue, ambiguousClients, client, client.code);
        createdClients++;
      }
      if (!client) { skipped.push({ orderNumber: group.orderNumber, reason: `Client introuvable : ${clientValue}` }); continue; }

      const agencyKey = normalizeImportHeader(agencyValue);
      if (ambiguousAgencies.has(agencyKey)) {
        skipped.push({ orderNumber: group.orderNumber, reason: `Agence ambiguë : ${agencyValue}` });
        continue;
      }
      let agency = agenciesByValue.get(agencyKey);
      if (!agency && createMissing) {
        const code = makeCode(agencyValue, "AGENCE", agencyCodes);
        [agency] = await db.insert(agencies).values({ name: agencyValue, code }).returning();
        registerReference(agenciesByValue, ambiguousAgencies, agency, agency.name);
        registerReference(agenciesByValue, ambiguousAgencies, agency, agency.code);
        createdAgencies++;
      }
      if (!agency) { skipped.push({ orderNumber: group.orderNumber, reason: `Agence introuvable : ${agencyValue}` }); continue; }

      const sourceNumber = group.orderNumber;
      let orderNumber = sourceNumber;
      const [existing] = sourceNumber ? await db.select({ id: orders.id }).from(orders).where(eq(orders.orderNumber, sourceNumber)).limit(1) : [];
      if (existing && duplicateMode !== "new") {
        skipped.push({ orderNumber: sourceNumber, reason: "Commande déjà existante" });
        continue;
      }
      if (!orderNumber || existing) orderNumber = await generateOrderNumber();

      const items = group.rows.map((row) => {
        const articleName = sourceValue(row, "articleName", mapping).trim();
        const quantityRaw = sourceValue(row, "quantity", mapping).trim();
        const quantityValue = parseNumber(quantityRaw, Number.NaN);
        if (!articleName || !quantityRaw || !Number.isFinite(quantityValue) || quantityValue < 1) {
          warnings.push(`${row.sheet.name}, ligne ${row.sheet.headerRow + row.rowIndex + 2} : article et quantité positifs sont obligatoires.`);
          return null;
        }
        const quantity = Math.round(quantityValue);
        const producedQty = Math.max(0, Math.round(parseNumber(sourceValue(row, "producedQty", mapping), 0)));
        const deliveredSource = sourceValue(row, "deliveredQty", mapping);
        const remainingSource = sourceValue(row, "remainingQty", mapping);
        const deliveredQty = deliveredSource !== ""
          ? Math.max(0, Math.round(parseNumber(deliveredSource, 0)))
          : remainingSource !== ""
            ? Math.max(0, quantity - Math.round(parseNumber(remainingSource, quantity)))
            : 0;
        return {
          articleName,
          quantity,
          reference: sourceValue(row, "reference", mapping).trim() || null,
          clientSpec: sourceValue(row, "clientSpec", mapping).trim() || null,
          productionUnit: sourceValue(row, "productionUnit", mapping).trim() || null,
          plannedLoadingDate: sourceValue(row, "plannedLoadingDate", mapping).trim() ? parseDate(sourceValue(row, "plannedLoadingDate", mapping)) : null,
          producedQty,
          deliveredQty,
          deliveryDate: sourceValue(row, "deliveryDate", mapping).trim() ? parseDate(sourceValue(row, "deliveryDate", mapping)) : null,
          pcb: sourceValue(row, "pcb", mapping).trim() || null,
          colorTemperature: sourceValue(row, "colorTemperature", mapping).trim() || null,
          lens: sourceValue(row, "lens", mapping).trim() || null,
          driver: sourceValue(row, "driver", mapping).trim() || null,
          electricalClass: sourceValue(row, "electricalClass", mapping).trim() || null,
          accessories: sourceValue(row, "accessories", mapping).trim() || null,
          otherTechSpecs: sourceValue(row, "otherTechSpecs", mapping).trim() || null,
          note: sourceValue(row, "note", mapping).trim() || null,
          unitPrice: parseNumber(sourceValue(row, "unitPrice", mapping), 0) || null,
          description: sourceValue(row, "description", mapping).trim() || null,
        };
      }).filter((item): item is NonNullable<typeof item> => item !== null);
      if (items.length === 0) { skipped.push({ orderNumber: group.orderNumber, reason: "Aucun article exploitable" }); continue; }

      const productionStatus = inferProductionStatusFromExcel(sourceValue(first, "productionStatus", mapping), groupColor);
      await db.transaction(async (tx) => {
        const [createdOrder] = await tx.insert(orders).values({
          orderNumber,
          orderDate: parseDate(sourceValue(first, "orderDate", mapping)),
          priority: normalizePriority(sourceValue(first, "priority", mapping)),
          clientId: client.id,
          agencyId: agency.id,
          status,
          productionStatus,
          affaire: sourceValue(first, "affaire", mapping).trim() || null,
          cancelReason: sourceValue(first, "cancelReason", mapping).trim() || null,
          createdBy: user.id,
          createdByName: user.fullName,
        }).returning({ id: orders.id });
        await tx.insert(orderItems).values(items.map((item) => ({ ...item, orderId: createdOrder.id })));
      });
      imported.push({ orderNumber, items: items.length });
    }

    const importedItems = imported.reduce((sum, item) => sum + item.items, 0);
    await logActivity(user.id, user.username, "IMPORT_ORDERS", `${file.name}: ${imported.length} commande(s), ${importedItems} article(s)`);
    if (imported.length > 0) {
      await notifyRoles(["technique", "planification"], {
        eventKey: NOTIFICATION_EVENTS.ORDER_CREATED,
        title: `${imported.length} commande(s) importée(s)`,
        message: `${user.fullName} a importé ${imported.length} commande(s) et ${importedItems} article(s) depuis ${file.name}`,
        targetTab: "orders",
      });
    }
    return NextResponse.json({ ok: true, importedOrders: imported.length, importedItems, createdClients, createdAgencies, imported, skipped, warnings }, { status: 201 });
  } catch (error) {
    console.error("Erreur import commandes:", error);
    return NextResponse.json({ error: "Erreur lors de l'import des commandes : " + String(error) }, { status: 500 });
  }
}
