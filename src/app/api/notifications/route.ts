export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, desc, and, count } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

/**
 * GET /api/notifications
 *
 * Par défaut, le client récupère les non-lues pour le compteur. Avec `all=1`,
 * l'historique complet de l'utilisateur est retourné : aucune notification
 * d'un autre utilisateur n'est jamais accessible.
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const unreadOnly = sp.get("unread") === "1";
  const all = sp.get("all") === "1";
  const requestedLimit = Number.parseInt(sp.get("limit") || "50", 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 50;
  const offset = Math.max(Number.parseInt(sp.get("offset") || "0", 10) || 0, 0);
  const conds = [eq(notifications.userId, user.id)];
  if (unreadOnly) conds.push(eq(notifications.read, false));
  const where = and(...conds);

  const dataQuery = db.select().from(notifications).where(where).orderBy(desc(notifications.createdAt));
  const data = all ? await dataQuery : await dataQuery.limit(limit).offset(offset);
  const [unreadRow] = await db.select({ value: count(notifications.id) })
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), eq(notifications.read, false)));
  const [totalRow] = await db.select({ value: count(notifications.id) })
    .from(notifications)
    .where(and(eq(notifications.userId, user.id)));

  return NextResponse.json({
    notifications: data,
    unreadCount: Number(unreadRow?.value || 0),
    total: Number(totalRow?.value || 0),
    hasMore: !all && offset + data.length < Number(totalRow?.value || 0),
  }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
