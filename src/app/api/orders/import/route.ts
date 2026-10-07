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

type Merge = { s: { r: number; c: number }; e: { r: number; c: number } };
type WorksheetLike = { [key: string]: unknown; "!merges"?: Merge[]; "!ref"?: string };
type ParsedSheet = {
  index: number;
  name: string;
  headerRow: number;
  headers: string[];
  rows: string[][];
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
  if (typeof sheet["!ref"] === "string") {
    const match = /^([A-Z]+)(\d+):/.exec(sheet["!ref"]);
    if (match) originRow = Number(match[2]) - 1;
  }
  for (const merge of merges) {
    const firstRow = merge.s.r - originRow;
    const lastRow = merge.e.r - originRow;
    const value = matrix[firstRow]?.[merge.s.c];
    if (value === undefined || value === null || cellText(value) === "") continue;
    for (let row = firstRow; row <= lastRow && row < matrix.length; row++) {
      if (!matrix[row]) matrix[row] = [];
      for (let column = merge.s.c; column <= merge.e.c; column++) {
        if (matrix[row][column] === undefined || cellText(matrix[row][column]) === "") matrix[row][column] = value;
      }
    }
  }
}

function parseSheet(XLSX: typeof import("xlsx"), name: string, index: number, worksheet: WorksheetLike): ParsedSheet | null {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet as unknown as import("xlsx").WorkSheet, {
    header: 1,
    defval: "",
    blankrows: true,
    raw: true,
  }) as unknown as unknown[][];
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
  const dateColumns = new Set(headers.map((header, column) => normalizeImportHeader(header).includes("date") ? column : -1).filter((column) => column >= 0));
  const rows: string[][] = [];
  for (let row = headerRow + 1; row < matrix.length; row++) {
    const values = Array.from({ length: width }, (_, column) => dateColumns.has(column) ? excelDate(matrix[row]?.[column]) : cellText(matrix[row]?.[column]));
    if (values.every((value) => value === "")) continue;
    rows.push(values);
  }
  return { index, name, headerRow, headers, rows, mapping: suggestOrderImportMapping(headers) };
}

async function readWorkbook(file: File): Promise<ParsedSheet[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", cellDates: true, raw: true });
  const sheets: ParsedSheet[] = [];
  workbook.SheetNames.forEach((name, index) => {
    const worksheet = workbook.Sheets[name] as unknown as WorksheetLike;
    const parsed = parseSheet(XLSX, name, index, worksheet);
    if (parsed) sheets.push(parsed);
  });
  return sheets;
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

function normalizeCommercialStatus(value: string): "SUR_STOCK" | "BON_COMMANDE" | "PREVISION" {
  const normalized = normalizeImportHeader(value);
  if (normalized.includes("stock") || normalized.includes("besoininterne")) return "SUR_STOCK";
  if (normalized.includes("boncommande") || normalized.includes("commande")) return "BON_COMMANDE";
  return "PREVISION";
}

function normalizeProductionStatus(value: string): "EN_INSTANCE" | "EN_PRODUCTION" | "LIVREE" | "ANNULEE" {
  const normalized = normalizeImportHeader(value);
  if (normalized.includes("annul")) return "ANNULEE";
  if (normalized.includes("livr") || normalized.includes("termine")) return "LIVREE";
  if (normalized.includes("production") || normalized.includes("cours")) return "EN_PRODUCTION";
  return "EN_INSTANCE";
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
    const clientCodes = new Set<string>();
    const agencyCodes = new Set<string>();
    for (const client of allClients) {
      clientsByValue.set(normalizeImportHeader(client.name), client);
      clientsByValue.set(normalizeImportHeader(client.code), client);
      clientCodes.add(client.code);
    }
    for (const agency of allAgencies) {
      agenciesByValue.set(normalizeImportHeader(agency.name), agency);
      agenciesByValue.set(normalizeImportHeader(agency.code), agency);
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
      const status = normalizeCommercialStatus(sourceValue(first, "commercialStatus", mapping));
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

      let client = clientsByValue.get(normalizeImportHeader(clientValue));
      if (!client && createMissing) {
        const code = makeCode(clientValue, "CLIENT", clientCodes);
        [client] = await db.insert(clients).values({ name: clientValue, code }).returning();
        clientsByValue.set(normalizeImportHeader(client.name), client);
        clientsByValue.set(normalizeImportHeader(client.code), client);
        createdClients++;
      }
      if (!client) { skipped.push({ orderNumber: group.orderNumber || "(sans numéro)", reason: `Client introuvable : ${clientValue}` }); continue; }

      let agency = agencyValue ? agenciesByValue.get(normalizeImportHeader(agencyValue)) : undefined;
      if (!agency && agencyValue && createMissing) {
        const code = makeCode(agencyValue, "AGENCE", agencyCodes);
        [agency] = await db.insert(agencies).values({ name: agencyValue, code }).returning();
        agenciesByValue.set(normalizeImportHeader(agency.name), agency);
        agenciesByValue.set(normalizeImportHeader(agency.code), agency);
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

      const productionStatus = normalizeProductionStatus(sourceValue(first, "productionStatus", mapping));
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
