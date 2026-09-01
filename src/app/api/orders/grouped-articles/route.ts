export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, clients, agencies } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";
import { groupArticles, type GroupableItem } from "@/lib/article-grouping";

/**
 * GET /api/orders/grouped-articles
 * Regroupement des articles de toutes les commandes par préfixe de 3 caractères.
 * Toujours à jour : la donnée est recalculée à chaque appel depuis les commandes.
 *
 * Query : status, agencyId, priority (mêmes filtres que /api/orders)
 *         format=xlsx pour télécharger l'export Excel.
 * Lecture : tout utilisateur authentifié (vue d'affichage, aucune écriture).
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const status = sp.get("status");
  const agencyId = sp.get("agencyId");
  const priority = sp.get("priority");
  const format = sp.get("format");

  const conds = [];
  if (status) conds.push(eq(orders.status, status));
  if (agencyId) conds.push(eq(orders.agencyId, parseInt(agencyId)));
  if (priority) conds.push(eq(orders.priority, priority));
  const where = conds.length > 0 ? and(...conds) : undefined;

  try {
    // Une seule requête jointe : pas de N+1
    const rows = await db
      .select({
        articleName: orderItems.articleName,
        quantity: orderItems.quantity,
        producedQty: orderItems.producedQty,
        deliveredQty: orderItems.deliveredQty,
        affaire: orders.affaire,
        orderNumber: orders.orderNumber,
        orderDate: orders.orderDate,
        productionStatus: orders.productionStatus,
        clientName: clients.name,
        agencyName: agencies.name,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .leftJoin(clients, eq(orders.clientId, clients.id))
      .leftJoin(agencies, eq(orders.agencyId, agencies.id))
      .where(where)
      .orderBy(desc(orders.createdAt));

    const groups = groupArticles(rows as GroupableItem[]);

    if (format === "xlsx") {
      const XLSX = await import("xlsx");
      const statusLabels: Record<string, string> = {
        EN_INSTANCE: "En instance", EN_PRODUCTION: "En production", LIVREE: "Livrée", ANNULEE: "Annulée",
      };

      // Feuille détaillée : une ligne par article, séparateurs de groupe
      const detail: Record<string, unknown>[] = [];
      for (const g of groups) {
        for (const l of g.lines) {
          detail.push({
            "Groupe": g.key,
            "Article": l.articleName,
            "Quantité": l.quantity,
            "Affaire": l.affaire || "",
            "Client": l.clientName || "",
            "N° Commande": l.orderNumber || "",
            "Date": l.orderDate || "",
            "Produit": l.producedQty,
            "Livré": l.deliveredQty,
            "Reste à livrer": l.remaining,
            "État Production": statusLabels[l.productionStatus || ""] || l.productionStatus || "",
          });
        }
        detail.push({
          "Groupe": g.key, "Article": `TOTAL ${g.key}`, "Quantité": g.totalQuantity, "Affaire": "",
          "Client": "", "N° Commande": "", "Date": "",
          "Produit": g.totalProduced, "Livré": g.totalDelivered, "Reste à livrer": g.totalRemaining, "État Production": "",
        });
        detail.push({});
      }

      // Feuille synthèse : un total par groupe
      const summary = groups.map(g => ({
        "Groupe (3 car.)": g.key,
        "Articles du groupe": g.variants.join(" | "),
        "Nb variantes": g.variants.length,
        "Nb lignes": g.lines.length,
        "Quantité totale": g.totalQuantity,
        "Produit": g.totalProduced,
        "Livré": g.totalDelivered,
        "Reste à livrer": g.totalRemaining,
      }));

      const wb = XLSX.utils.book_new();
      const wsSum = XLSX.utils.json_to_sheet(summary);
      wsSum["!cols"] = [{ wch: 14 }, { wch: 50 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsSum, "Synthèse par groupe");

      const wsDet = XLSX.utils.json_to_sheet(detail);
      wsDet["!cols"] = [{ wch: 10 }, { wch: 30 }, { wch: 10 }, { wch: 22 }, { wch: 24 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsDet, "Détail par article");

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      const filename = `regroupement-articles-${new Date().toISOString().slice(0, 10)}.xlsx`;
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({
      groups,
      totals: {
        groups: groups.length,
        lines: groups.reduce((s, g) => s + g.lines.length, 0),
        quantity: groups.reduce((s, g) => s + g.totalQuantity, 0),
        produced: groups.reduce((s, g) => s + g.totalProduced, 0),
        delivered: groups.reduce((s, g) => s + g.totalDelivered, 0),
        remaining: groups.reduce((s, g) => s + g.totalRemaining, 0),
      },
    });
  } catch (error) {
    console.error("Erreur regroupement articles:", error);
    return NextResponse.json({ error: "Erreur lors du regroupement des articles" }, { status: 500 });
  }
}
