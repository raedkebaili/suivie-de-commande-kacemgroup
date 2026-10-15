export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agencies, userAgencyAccess, users } from "@/db/schema";
import { getUserFromHeaders, hashPassword, logActivity } from "@/lib/auth";
import { passwordPolicyError } from "@/lib/password-policy";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 500;
const ALLOWED_ROLES = new Set([
  "superadmin",
  "commercial",
  "technique",
  "planification",
  "consultant_prod",
  "recouvrement",
  "acces_agence",
  "gerant",
]);

type ImportRow = {
  rowNumber: number;
  username: string;
  fullName: string;
  password: string;
  role: string;
  agencyHints: string[];
};

type AgencyRow = { id: number; name: string; code: string; active: boolean };

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function rowValue(row: Record<string, unknown>, names: string[]): string {
  const wanted = new Set(names.map(normalized));
  const entry = Object.entries(row).find(([key]) => wanted.has(normalized(key)));
  return entry ? text(entry[1]) : "";
}

function roleFromCell(rawRole: string): { role: string; roleAgencyHint: string } | null {
  const value = normalized(rawRole);
  const role = value.startsWith("superadmin")
    ? "superadmin"
    : value.startsWith("commercial")
      ? "commercial"
      : value.startsWith("technique")
        ? "technique"
        : value.startsWith("planification")
          ? "planification"
          : value.startsWith("consultantprod")
            ? "consultant_prod"
            : value.startsWith("recouvrement")
              ? "recouvrement"
              : value.startsWith("accesagence")
                ? "acces_agence"
                : value.startsWith("gerant")
                  ? "gerant"
                  : null;
  if (!role) return null;

  const parenthesized = /\(([^)]+)\)/.exec(rawRole)?.[1]?.trim() || "";
  return { role, roleAgencyHint: parenthesized };
}

function agencyHintsFromRow(row: Record<string, unknown>, roleCell: string): string[] {
  const explicit = rowValue(row, ["agence", "agences", "agency", "agencies"]);
  const roleHint = /\(([^)]+)\)/.exec(roleCell)?.[1]?.trim() || "";
  return [...new Set(`${explicit};${roleHint}`
    .split(/[;,|]/)
    .map((value) => value.trim())
    .filter(Boolean))];
}

function findAgency(hint: string, available: AgencyRow[]): AgencyRow | undefined {
  const wanted = normalized(hint);
  if (!wanted) return undefined;
  return available.find((agency) => {
    const name = normalized(agency.name);
    const code = normalized(agency.code);
    return name === wanted || code === wanted || name.includes(wanted) || wanted.includes(name) || code.includes(wanted) || wanted.includes(code);
  });
}

function parseRows(rows: Record<string, unknown>[]): { rows: ImportRow[]; errors: string[] } {
  const parsed: ImportRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (!Object.values(row).some((value) => text(value))) return;

    const username = rowValue(row, ["utilisateur", "username", "nom utilisateur", "nom_utilisateur", "identifiant", "login"]);
    const fullName = rowValue(row, ["nom complet", "nom_complet", "fullname", "full name"]);
    const password = rowValue(row, ["mot de passe", "mot_de_passe", "password", "mdp"]);
    const roleCell = rowValue(row, ["rôle", "role"]);
    const parsedRole = roleFromCell(roleCell);
    const rowErrors: string[] = [];

    if (!username) rowErrors.push("Utilisateur manquant");
    if (!fullName) rowErrors.push("Nom complet manquant");
    if (!password) rowErrors.push("Mot de passe manquant");
    const passwordError = password ? passwordPolicyError(password) : null;
    if (passwordError) rowErrors.push(`Mot de passe trop faible (${passwordError})`);
    if (!parsedRole) rowErrors.push(`Rôle inconnu « ${roleCell || ""} »`);
    if (username && seen.has(username.toLowerCase())) rowErrors.push("Utilisateur présent plusieurs fois dans le fichier");

    if (rowErrors.length > 0) {
      errors.push(`Ligne ${rowNumber} : ${rowErrors.join(" ; ")}`);
      return;
    }
    seen.add(username.toLowerCase());
    parsed.push({
      rowNumber,
      username,
      fullName,
      password,
      role: parsedRole!.role,
      agencyHints: agencyHintsFromRow(row, roleCell),
    });
  });

  return { rows: parsed, errors };
}

export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Import réservé au Super Admin" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof (file as File).arrayBuffer !== "function") {
      return NextResponse.json({ error: "Fichier Excel requis" }, { status: 400 });
    }
    if ((file as File).size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Fichier trop volumineux (5 Mo maximum)" }, { status: 400 });
    }

    const XLSX = await import("xlsx");
    const workbook = XLSX.read(Buffer.from(await (file as File).arrayBuffer()), { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return NextResponse.json({ error: "Le classeur ne contient aucune feuille" }, { status: 400 });
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
    if (rows.length === 0) return NextResponse.json({ error: "La feuille Excel est vide" }, { status: 400 });
    if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Le fichier dépasse la limite de ${MAX_ROWS} lignes` }, { status: 400 });

    const parsed = parseRows(rows);
    if (parsed.errors.length > 0) {
      return NextResponse.json({ error: "Import refusé : corrigez le fichier Excel", details: parsed.errors.slice(0, 20) }, { status: 400 });
    }
    if (parsed.rows.length === 0) return NextResponse.json({ error: "Aucun utilisateur valide trouvé" }, { status: 400 });

    const availableAgencies = await db
      .select({ id: agencies.id, name: agencies.name, code: agencies.code, active: agencies.active })
      .from(agencies)
      .where(eq(agencies.active, true));
    const rowsWithAgencies = parsed.rows.map((row) => {
      const agencyIds = row.role === "acces_agence"
        ? [...new Set(row.agencyHints.map((hint) => findAgency(hint, availableAgencies)).filter((agency): agency is AgencyRow => Boolean(agency)).map((agency) => agency.id))]
        : [];
      return { ...row, agencyIds };
    });
    const missingAgency = rowsWithAgencies.find((row) => row.role === "acces_agence" && row.agencyIds.length === 0);
    if (missingAgency) {
      return NextResponse.json({
        error: `Ligne ${missingAgency.rowNumber} : aucune agence active reconnue pour le rôle Accès agence`,
        details: ["Ajoutez une colonne Agence/Agences ou indiquez l'agence entre parenthèses dans la colonne Rôle."],
      }, { status: 400 });
    }

    const currentUserRow = rowsWithAgencies.find((row) => row.username.toLowerCase() === user.username.toLowerCase());
    if (currentUserRow && currentUserRow.role !== "superadmin") {
      return NextResponse.json({ error: "Le compte administrateur connecté ne peut pas être rétrogradé par import" }, { status: 400 });
    }

    const prepared = await Promise.all(rowsWithAgencies.map(async (row) => ({
      ...row,
      passwordHash: await hashPassword(row.password),
    })));

    let created = 0;
    let updated = 0;
    await db.transaction(async (tx) => {
      for (const row of prepared) {
        const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.username, row.username)).limit(1);
        let userId: number;
        if (existing) {
          userId = existing.id;
          await tx.update(users).set({
            fullName: row.fullName,
            role: row.role,
            passwordHash: row.passwordHash,
            active: true,
            mustChangePassword: true,
          }).where(eq(users.id, userId));
          updated++;
        } else {
          const [inserted] = await tx.insert(users).values({
            username: row.username,
            fullName: row.fullName,
            role: row.role,
            passwordHash: row.passwordHash,
            active: true,
            mustChangePassword: true,
          }).returning({ id: users.id });
          userId = inserted.id;
          created++;
        }

        await tx.delete(userAgencyAccess).where(eq(userAgencyAccess.userId, userId));
        if (row.agencyIds.length > 0) {
          await tx.insert(userAgencyAccess).values(row.agencyIds.map((agencyId) => ({ userId, agencyId })));
        }
      }
    });

    await logActivity(user.id, user.username, "IMPORT_USERS", `Import utilisateurs : ${created} créés, ${updated} mis à jour`);
    return NextResponse.json({ imported: prepared.length, created, updated });
  } catch (error) {
    console.error("[users/import] Échec de l'import :", error);
    return NextResponse.json({ error: "Erreur lors de l'import des utilisateurs" }, { status: 500 });
  }
}
