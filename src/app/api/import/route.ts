export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clients, agencies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";

// Generic import for clients / agencies.
// For technical component libraries (matières), use /api/matieres instead —
// it enforces the predefined category list used by the technical spec fields.
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromHeaders(request);
    if (!user || !["superadmin", "commercial"].includes(user.role))
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const fd = await request.formData();
    const file = fd.get("file") as File;
    const type = fd.get("type") as string;

    if (!file) return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    if (!type) return NextResponse.json({ error: "Type requis (clients, agencies)" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

    let imported = 0;
    for (const row of rows) {
      try {
        if (type === "clients") {
          const name = (row["Nom"] || row["name"] || "").trim();
          const code = (row["Code"] || row["code"] || "").trim().toUpperCase();
          if (!name || !code) continue;
          const ex = await db.select().from(clients).where(eq(clients.code, code)).limit(1);
          if (ex.length > 0) continue;
          await db.insert(clients).values({
            name, code,
            contactName: (row["Contact"] || row["contact_name"] || null) as string | null,
            phone: (row["Téléphone"] || row["phone"] || null) as string | null,
            email: (row["Email"] || row["email"] || null) as string | null,
            address: (row["Adresse"] || row["address"] || null) as string | null,
          });
          imported++;
        } else if (type === "agencies") {
          const name = (row["Nom"] || row["name"] || "").trim();
          const code = (row["Code"] || row["code"] || "").trim().toUpperCase();
          if (!name || !code) continue;
          const ex = await db.select().from(agencies).where(eq(agencies.code, code)).limit(1);
          if (ex.length > 0) continue;
          await db.insert(agencies).values({
            name, code,
            address: (row["Adresse"] || row["address"] || null) as string | null,
          });
          imported++;
        }
      } catch { /* skip bad row */ }
    }

    await logActivity(user.id, user.username, "IMPORT", `Import ${type}: ${imported} entrées`);
    return NextResponse.json({ imported, type });
  } catch (err) {
    console.error("Import error:", err);
    return NextResponse.json({ error: "Erreur lors de l'import: " + String(err) }, { status: 500 });
  }
}
