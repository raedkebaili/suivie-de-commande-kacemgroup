import { seedDefaultUser } from "@/lib/auth";
import { friendlyDbErrorMessage } from "@/lib/db-error";
import { ensureDefaultMaterialCategories } from "@/lib/material-categories";
import { ensureRecouvrementDefaults } from "@/lib/recouvrement";
import { ensureArchiveColors } from "@/lib/archive";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await seedDefaultUser();
    await ensureDefaultMaterialCategories();
    // Seeds recouvrement (idempotents) : les erreurs éventuelles n'empêchent
    // pas le healthcheck principal de répondre.
    try { await ensureRecouvrementDefaults(); } catch (e) { console.error("Seed recouvrement:", e); }
    try { await ensureArchiveColors(); } catch (e) { console.error("Seed archive:", e); }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("Health check error:", e);
    return Response.json({ ok: false, error: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
