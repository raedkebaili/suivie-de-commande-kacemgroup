export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, clients, agencies, itemTechnicalComponents, matieres, materialCategories, photometricStudies, photometricStudyItems } from "@/db/schema";
import { eq, desc, and, inArray, isNull } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const status = sp.get("status");
  const agencyId = sp.get("agencyId");
  const conds = [];
  if (status) conds.push(eq(orders.status, status));
  if (agencyId) conds.push(eq(orders.agencyId, parseInt(agencyId)));
  const where = conds.length > 0 ? and(...conds) : undefined;

  // Récupérer toutes les commandes
  const allOrders = await db.select({
    id: orders.id, orderNumber: orders.orderNumber, orderDate: orders.orderDate,
    priority: orders.priority, status: orders.status, productionStatus: orders.productionStatus,
    clientName: clients.name, agencyName: agencies.name,
    affaire: orders.affaire, createdByName: orders.createdByName,
    cancelReason: orders.cancelReason, cancelledBy: orders.cancelledBy, cancelledAt: orders.cancelledAt,
    techCompleted: orders.techCompleted, planifCompleted: orders.planifCompleted,
    updatedBy: orders.updatedBy, updatedAt: orders.updatedAt,
  }).from(orders).leftJoin(clients, eq(orders.clientId, clients.id))
    .leftJoin(agencies, eq(orders.agencyId, agencies.id))
    .where(where).orderBy(desc(orders.createdAt));

  const oids = allOrders.map(o => o.id);
  
  // Récupérer tous les articles
  let allItems: typeof orderItems.$inferSelect[] = [];
  if (oids.length > 0) allItems = await db.select().from(orderItems).where(inArray(orderItems.orderId, oids));

  // Récupérer tous les composants techniques
  const itemIds = allItems.map(item => item.id);
  let allTechComponents: (typeof itemTechnicalComponents.$inferSelect)[] = [];
  if (itemIds.length > 0) {
    allTechComponents = await db.select().from(itemTechnicalComponents)
      .where(inArray(itemTechnicalComponents.itemId, itemIds));
  }

  // Récupérer les catégories pour avoir les noms complets
  const allCategories = await db.select().from(materialCategories);
  const categoryMap = new Map(allCategories.map(c => [c.id, c]));

  // Labels de statut
  const statusLabels: Record<string, string> = { 
    SUR_STOCK: "Sur Stock",
    BON_COMMANDE: "Bon de Commande",
    PREVISION: "Prévision", 
    EN_INSTANCE: "En instance",
    EN_PRODUCTION: "En production", 
    LIVREE: "Livrée", 
    ANNULEE: "Annulée" 
  };

  const rows: Record<string, unknown>[] = [];
  
  for (const o of allOrders) {
    const items = allItems.filter(i => i.orderId === o.id);
    
    // Si aucun article, créer une ligne pour la commande seule
    if (items.length === 0) {
      rows.push({
        "N° Commande": o.orderNumber,
        "Date Commande": o.orderDate,
        "Priorité": o.priority,
        "Client": o.clientName,
        "Agence": o.agencyName,
        "Affaire": o.affaire || "",
        "État Commercial": statusLabels[o.status] || o.status,
        "État Production": statusLabels[o.productionStatus || ""] || o.productionStatus || "",
        "Créé par": o.createdByName || "",
        "Tech. Validé": o.techCompleted ? "Oui" : "Non",
        "Planif. Validé": o.planifCompleted ? "Oui" : "Non",
        "Modifié par": o.updatedBy || "",
        "Modifié le": o.updatedAt ? formatDate(o.updatedAt) : "",
        "Cause annulation": o.cancelReason || "",
        "Annulé par": o.cancelledBy || "",
        "Annulé le": o.cancelledAt || "",
        // Colonnes articles vides
        "Article": "",
        "Qté Commandée": "",
        "Besoin Client": "",
        "Unité Production": "",
        "Date Chargement": "",
        "Qté Produite": "",
        "Qté Livrée": "",
        "Reste à livrer": "",
        "Date livraison": "",
        // Spécifications techniques legacy
        "PCB": "", "PCB par": "", "PCB le": "",
        "Temp. Couleur": "", "TC par": "", "TC le": "",
        "Lentille": "", "Lentille par": "", "Lentille le": "",
        "Driver": "", "Driver par": "", "Driver le": "",
        "Classe Élec.": "", "CE par": "", "CE le": "",
        "Accessoires": "", "Acc par": "", "Acc le": "",
        "Autres Spécs": "", "OTS par": "", "OTS le": "",
        // Composants techniques dynamiques
        "Composants Techniques": "",
        "Accessoires Télégestion": "",
        "Note": "",
        "Prix unitaire": "",
      });
    }

    for (const it of items) {
      // Récupérer les composants techniques de cet article
      const techComps = allTechComponents.filter(tc => tc.itemId === it.id);
      
      // Séparer les composants normaux et télégestion
      const normalComps = techComps.filter(tc => !tc.isTelegestion);
      const telegestionComps = techComps.filter(tc => tc.isTelegestion);
      
      // Formater les composants techniques
      const techComponentsStr = normalComps.map(tc => {
        const cat = categoryMap.get(tc.categoryId || 0);
        return `[${tc.categoryName}] ${tc.materialReference} - ${tc.materialLabel} (par ${tc.enteredByName}, ${formatDate(tc.enteredAt)})`;
      }).join(" | ");
      
      // Formater les accessoires télégestion
      const telegestionStr = telegestionComps.map(tc => {
        return `${tc.materialReference} - ${tc.materialLabel} (par ${tc.enteredByName}, ${formatDate(tc.enteredAt)})`;
      }).join(" | ");

      rows.push({
        "N° Commande": o.orderNumber,
        "Date Commande": o.orderDate,
        "Priorité": o.priority,
        "Client": o.clientName,
        "Agence": o.agencyName,
        "Affaire": o.affaire || "",
        "État Commercial": statusLabels[o.status] || o.status,
        "État Production": statusLabels[o.productionStatus || ""] || o.productionStatus || "",
        "Créé par": o.createdByName || "",
        "Tech. Validé": o.techCompleted ? "Oui" : "Non",
        "Planif. Validé": o.planifCompleted ? "Oui" : "Non",
        "Modifié par": o.updatedBy || "",
        "Modifié le": o.updatedAt ? formatDate(o.updatedAt) : "",
        "Cause annulation": o.cancelReason || "",
        "Annulé par": o.cancelledBy || "",
        "Annulé le": o.cancelledAt || "",
        // Article
        "Article": it.articleName,
        "Qté Commandée": it.quantity,
        "Besoin Client": it.clientSpec || "",
        "Unité Production": it.productionUnit || "",
        "Date Chargement": it.plannedLoadingDate || "",
        "Qté Produite": it.producedQty || 0,
        "Qté Livrée": it.deliveredQty || 0,
        "Reste à livrer": Math.max(0, it.quantity - (it.deliveredQty || 0)),
        "Date livraison": it.deliveryDate || "",
        // Spécifications techniques legacy (conservées pour compatibilité)
        "PCB": it.pcb || "",
        "PCB par": it.pcbBy || "",
        "PCB le": it.pcbAt ? formatDate(it.pcbAt) : "",
        "Temp. Couleur": it.colorTemperature || "",
        "TC par": it.colorTempBy || "",
        "TC le": it.colorTempAt ? formatDate(it.colorTempAt) : "",
        "Lentille": it.lens || "",
        "Lentille par": it.lensBy || "",
        "Lentille le": it.lensAt ? formatDate(it.lensAt) : "",
        "Driver": it.driver || "",
        "Driver par": it.driverBy || "",
        "Driver le": it.driverAt ? formatDate(it.driverAt) : "",
        "Classe Élec.": it.electricalClass || "",
        "CE par": it.elecClassBy || "",
        "CE le": it.elecClassAt ? formatDate(it.elecClassAt) : "",
        "Accessoires": it.accessories || "",
        "Acc par": it.accessoriesBy || "",
        "Acc le": it.accessoriesAt ? formatDate(it.accessoriesAt) : "",
        "Autres Spécs": it.otherTechSpecs || "",
        "OTS par": it.otsBy || "",
        "OTS le": it.otsAt ? formatDate(it.otsAt) : "",
        // Nouveaux composants techniques dynamiques
        "Composants Techniques": techComponentsStr,
        "Accessoires Télégestion": telegestionStr,
        "Note": it.note || "",
        "Prix unitaire": it.unitPrice || "",
      });
    }
  }

  // Générer le fichier Excel
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  
  // Ajuster la largeur des colonnes
  if (rows.length > 0) {
    const colWidths: { wch: number }[] = [];
    const keys = Object.keys(rows[0]);
    for (const key of keys) {
      // Largeur adaptée au contenu
      let maxLen = key.length;
      for (const row of rows.slice(0, 50)) { // Vérifier les 50 premières lignes
        const val = String(row[key] || "");
        if (val.length > maxLen) maxLen = Math.min(val.length, 60); // Max 60 caractères
      }
      colWidths.push({ wch: Math.max(12, maxLen + 2) });
    }
    ws["!cols"] = colWidths;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Commandes");
  
  // Créer une feuille séparée pour les composants techniques détaillés
  if (allTechComponents.length > 0) {
    const techRows = allTechComponents.map(tc => {
      const item = allItems.find(i => i.id === tc.itemId);
      const order = allOrders.find(o => o.id === tc.orderId);
      return {
        "N° Commande": order?.orderNumber || "",
        "Article": item?.articleName || "",
        "Catégorie": tc.categoryName,
        "Référence": tc.materialReference,
        "Libellé": tc.materialLabel,
        "Télégestion": tc.isTelegestion ? "Oui" : "Non",
        "Saisi par": tc.enteredByName,
        "Date saisie": formatDate(tc.enteredAt),
      };
    });
    const ws2 = XLSX.utils.json_to_sheet(techRows);
    ws2["!cols"] = [
      { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, 
      { wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, ws2, "Composants Techniques");
  }

  // ── Feuille 3 : Études Photométriques ──
  const allStudies = await db.select().from(photometricStudies).orderBy(desc(photometricStudies.createdAt));
  if (allStudies.length > 0) {
    const studyIds = allStudies.map(s => s.id);
    const allStudyItems = await db.select().from(photometricStudyItems)
      .where(inArray(photometricStudyItems.studyId, studyIds));

    const studyRows: Record<string, unknown>[] = [];
    for (const study of allStudies) {
      const items = allStudyItems.filter(i => i.studyId === study.id);
      const linkedOrder = study.orderId ? allOrders.find(o => o.id === study.orderId) : null;

      if (items.length === 0) {
        studyRows.push({
          "N° Étude": study.studyNumber,
          "Type": study.orderId ? "Liée à commande" : "Indépendante",
          "N° Commande": linkedOrder?.orderNumber || "",
          "Affaire": study.affaireName || linkedOrder?.affaire || "",
          "Produit": "",
          "Lentille Réf.": "",
          "Lentille": "",
          "Note Étude": study.note || "",
          "Note Produit": "",
          "Responsable": study.createdByName,
          "Date": formatDate(study.createdAt),
        });
      }
      for (const item of items) {
        studyRows.push({
          "N° Étude": study.studyNumber,
          "Type": study.orderId ? "Liée à commande" : "Indépendante",
          "N° Commande": linkedOrder?.orderNumber || "",
          "Affaire": study.affaireName || linkedOrder?.affaire || "",
          "Produit": item.productName,
          "Lentille Réf.": item.lensReference || "",
          "Lentille": item.lensLabel || "",
          "Note Étude": study.note || "",
          "Note Produit": item.note || "",
          "Responsable": study.createdByName,
          "Date": formatDate(study.createdAt),
        });
      }
    }

    const ws3 = XLSX.utils.json_to_sheet(studyRows);
    ws3["!cols"] = [
      { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 25 },
      { wch: 25 }, { wch: 18 }, { wch: 25 }, { wch: 30 },
      { wch: 30 }, { wch: 20 }, { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, ws3, "Études Photométriques");
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="commandes_${new Date().toISOString().split("T")[0]}.xlsx"`,
    },
  });
}

// Fonction utilitaire pour formater les dates
function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr.substring(0, 16);
    return date.toLocaleDateString("fr-FR") + " " + date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return dateStr.substring(0, 16);
  }
}
