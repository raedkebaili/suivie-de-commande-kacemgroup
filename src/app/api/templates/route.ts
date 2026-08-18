export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";


export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const type = sp.get("type") || "clients";
  const category = sp.get("category") || "";
  const XLSX = await import("xlsx");

  let headers: string[];
  let filename = "modele";

  if (type === "clients") {
    headers = ["Nom", "Code", "Contact", "Téléphone", "Email", "Adresse"];
    filename = "modele_import_clients";
  } else if (type === "agencies") {
    headers = ["Nom", "Code", "Adresse"];
    filename = "modele_import_agences";
  } else if (type === "matieres") {
    headers = ["Référence", "Libellé", "Stock", "Spécifications"];
    filename = category ? `modele_import_${category}` : "modele_import_matiere";
    const ws = XLSX.utils.aoa_to_sheet([headers, ["REF-001", "Exemple de matière", 100, "Détails optionnels"]]);
    ws["!cols"] = headers.map((h: string) => ({ wch: Math.max(20, h.length + 5) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modèle");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(buf as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  } else {
    headers = ["Nom", "Code"];
  }

  const ws = XLSX.utils.aoa_to_sheet([headers]);
  ws["!cols"] = headers.map(h => ({ wch: Math.max(15, h.length + 5) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Modèle");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
    },
  });
}
