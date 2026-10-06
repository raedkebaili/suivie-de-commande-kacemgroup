export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { productionPlanEntries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { NOTIFICATION_EVENTS, notifyRoles } from "@/lib/notifications";
import { applyProductionQuantity } from "@/lib/production-apply";
import {
  PLANNING_MANAGER_ROLES,
  PLANNING_STATUS_BY_KEY,
  isValidPlanningStatus,
  planningStatusLabel,
} from "@/lib/production-planning-constants";

function canManage(role: string) {
  return (PLANNING_MANAGER_ROLES as readonly string[]).includes(role);
}

/**
 * PUT /api/production-planning/[id]
 * Met à jour une ligne de planning : statut, raison, quantité planifiée.
 * Rôles : superadmin, planification.
 *
 * RÈGLE CLÉ — passage au statut TERMINE :
 *   la quantité planifiée est appliquée à la production réelle via la logique
 *   partagée (lot de production, cumul sur l'article, LIVREE, promotion des
 *   priorités), donc l'onglet Production et le tableau des commandes sont
 *   mis à jour. L'application est IDEMPOTENTE : une ligne déjà appliquée
 *   (appliedAt renseigné) ne reproduit jamais la quantité une seconde fois.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!canManage(user.role)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await params;
  const entryId = parseInt(id);
  if (!Number.isFinite(entryId)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });

  try {
    const [entry] = await db.select().from(productionPlanEntries).where(eq(productionPlanEntries.id, entryId)).limit(1);
    if (!entry) return NextResponse.json({ error: "Ligne de planning non trouvée" }, { status: 404 });

    const body = await request.json();
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now, updatedByName: user.fullName };
    let meaningfulChange = false;

    // ── Quantité planifiée ──
    if (body.plannedQty !== undefined) {
      const q = parseInt(String(body.plannedQty));
      if (!Number.isFinite(q) || q <= 0) return NextResponse.json({ error: "Quantité invalide" }, { status: 400 });
      if (entry.appliedAt) {
        return NextResponse.json({ error: "Quantité non modifiable : la production a déjà été appliquée" }, { status: 400 });
      }
      if (q !== entry.plannedQty) meaningfulChange = true;
      updates.plannedQty = q;
    }

    // ── Raison (motif de suspension / annulation) ──
    if (body.reason !== undefined) {
      const nextReason = String(body.reason || "").trim() || null;
      if (nextReason !== entry.reason) meaningfulChange = true;
      updates.reason = nextReason;
    }

    // ── Statut ──
    let applied: Awaited<ReturnType<typeof applyProductionQuantity>> | null = null;
    if (body.status !== undefined) {
      if (!isValidPlanningStatus(body.status)) {
        return NextResponse.json({ error: "Statut de planning invalide" }, { status: 400 });
      }
      const def = PLANNING_STATUS_BY_KEY[body.status];

      // Motif obligatoire pour Suspendu / Annulé
      const effectiveReason = body.reason !== undefined
        ? String(body.reason || "").trim()
        : (entry.reason || "");
      if (def.requiresReason && !effectiveReason) {
        return NextResponse.json({
          error: `Le motif est requis pour le statut « ${def.label} » (colonne Raison)`,
        }, { status: 400 });
      }

      // ── TERMINE : application unique de la quantité à la production réelle ──
      if (body.status === "TERMINE" && !entry.appliedAt) {
        const qty = updates.plannedQty !== undefined ? (updates.plannedQty as number) : entry.plannedQty;
        applied = await applyProductionQuantity({
          itemId: entry.itemId,
          qty,
          productionDate: entry.planDate,
          user,
          logSuffix: `[planning ${entry.planDate}]`,
        });
        if (!applied.ok) {
          // La production n'a pas pu être appliquée : on NE change pas le statut,
          // afin que le planning reste le reflet exact de la réalité.
          return NextResponse.json({ error: applied.error }, { status: applied.status });
        }
        updates.appliedQty = applied.actualQty;
        updates.appliedAt = now;
      }

      if (body.status !== entry.status) meaningfulChange = true;
      updates.status = body.status;
    }

    const [updated] = await db.update(productionPlanEntries)
      .set(updates).where(eq(productionPlanEntries.id, entryId)).returning();

    if (body.status !== undefined && body.status !== entry.status) {
      await logActivity(user.id, user.username, "PLANNING_STATUS",
        `${entry.articleName} (#${entry.orderNumber || entry.orderId}) : ${planningStatusLabel(entry.status)} → ${planningStatusLabel(body.status)}` +
        (updates.reason ? ` — ${updates.reason}` : "") +
        (applied && applied.ok ? ` | +${applied.actualQty} produit` : ""));
    }

    if (meaningfulChange) {
      await notifyRoles(["consultant_prod"], {
        eventKey: NOTIFICATION_EVENTS.PLANNING_UPDATED,
        title: `Planning modifié #${entry.orderNumber || entry.orderId}`,
        message: `${entry.articleName} a été modifié par ${user.fullName}`,
        orderId: entry.orderId,
        targetTab: "planning",
      });
    }

    return NextResponse.json({
      entry: updated,
      applied: applied && applied.ok
        ? { actualQty: applied.actualQty, cumulative: applied.cumulative, remaining: applied.remaining,
            priorityPromotion: applied.priorityPromotion }
        : null,
    });
  } catch (error) {
    console.error("Erreur mise à jour planning:", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour du planning" }, { status: 500 });
  }
}

/**
 * DELETE /api/production-planning/[id]
 * Retire une ligne du planning. Une ligne déjà appliquée en production ne peut
 * pas être supprimée (la quantité produite resterait, créant une incohérence).
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!canManage(user.role)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await params;
  const entryId = parseInt(id);
  if (!Number.isFinite(entryId)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });

  try {
    const [entry] = await db.select().from(productionPlanEntries).where(eq(productionPlanEntries.id, entryId)).limit(1);
    if (!entry) return NextResponse.json({ error: "Ligne non trouvée" }, { status: 404 });
    if (entry.appliedAt) {
      return NextResponse.json({
        error: "Impossible de supprimer : la production de cette ligne a déjà été enregistrée",
      }, { status: 400 });
    }

    await db.delete(productionPlanEntries).where(eq(productionPlanEntries.id, entryId));
    await logActivity(user.id, user.username, "PLANNING_DELETE", `Planning ${entry.planDate} : ${entry.articleName} retiré`);
    await notifyRoles(["consultant_prod"], {
      eventKey: NOTIFICATION_EVENTS.PLANNING_UPDATED,
      title: `Planning supprimé #${entry.orderNumber || entry.orderId}`,
      message: `${entry.articleName} du ${entry.planDate} a été retiré par ${user.fullName}`,
      orderId: entry.orderId,
      targetTab: "planning",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erreur suppression planning:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }
}
