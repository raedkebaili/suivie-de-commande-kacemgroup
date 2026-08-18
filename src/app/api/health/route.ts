import { seedDefaultUser } from "@/lib/auth";
import { friendlyDbErrorMessage } from "@/lib/db-error";
import { ensureDefaultMaterialCategories } from "@/lib/material-categories";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await seedDefaultUser();
    await ensureDefaultMaterialCategories();
    return Response.json({ ok: true });
  } catch (e) {
    console.error("Health check error:", e);
    return Response.json({ ok: false, error: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
