import { NextRequest, NextResponse } from "next/server";
import { matchesBackupSecret } from "@/lib/backup-cron-auth";
import { runAutomaticBackup } from "@/lib/automatic-backup";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
/** Vercel Cron appelle en GET avec Authorization: Bearer CRON_SECRET. */
export async function GET(request: NextRequest) {
  if (!matchesBackupSecret(request.headers.get("authorization"), process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : undefined)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try { return NextResponse.json(await runAutomaticBackup({ source: "cron" })); }
  catch { return NextResponse.json({ ok: false, error: "Échec de sauvegarde, consultez l’historique." }, { status: 500 }); }
}
