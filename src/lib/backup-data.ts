/**
 * Collecte des données de sauvegarde — SOURCE UNIQUE DE VÉRITÉ.
 *
 * Utilisée à la fois par la sauvegarde manuelle (GET /api/backup) et par la
 * sauvegarde automatique (POST /api/backup/auto). Centraliser cette liste
 * évite qu'un module ajouté plus tard soit présent dans une sauvegarde mais
 * absent de l'autre (cas constaté : archive / recouvrement / configuration
 * manquaient dans la sauvegarde automatique).
 *
 * `backup_history` est volontairement exclue : elle contient les sauvegardes
 * elles-mêmes (contenu JSON complet), l'inclure ferait grossir chaque fichier
 * de façon exponentielle.
 *
 * Ordre des clés = ordre FK-safe (parents d'abord) attendu par la restauration.
 */
import { db } from "@/db";
import {
  users, agencies, userAgencyAccess, clients, orders, orderItems, productionBatches, expeditionBatches, expeditionPlanEntries,
  productionUnitLib, articleLibrary, techLibrary, materialCategories, matieres,
  itemTechnicalComponents, activityLogs, modificationLogs, notifications,
  photometricStudies, photometricStudyItems,
  recouvrementStates, clientRecouvrementStates, clientRecouvrementLogs,
  systemSettings, appColors, orderCounters,
  archiveSheets, archiveRows, archiveCellColors,
  productionPlanEntries, factories, storageConfig,
} from "@/db/schema";

export async function collectBackupData() {
  const data = {
    // CORRECTIF SÉCURITÉ (R8) : les sauvegardes JSON ne contiennent JAMAIS
    // les condensats de mots de passe. À la restauration, les comptes
    // concernés reçoivent un mot de passe temporaire + mustChangePassword.
    users: (await db.select().from(users)).map(({ passwordHash, ...safeUser }) => ({
      ...safeUser,
      passwordHash: null, // jamais exporté (champ conservé pour compat restauration)
    })) as unknown as (typeof users.$inferSelect)[],
    agencies: await db.select().from(agencies),
    userAgencyAccess: await db.select().from(userAgencyAccess),
    clients: await db.select().from(clients),
    orders: await db.select().from(orders),
    orderItems: await db.select().from(orderItems),
    productionBatches: await db.select().from(productionBatches),
    expeditionBatches: await db.select().from(expeditionBatches),
    expeditionPlanEntries: await db.select().from(expeditionPlanEntries),
    productionUnitLib: await db.select().from(productionUnitLib),
    articleLibrary: await db.select().from(articleLibrary),
    techLibrary: await db.select().from(techLibrary),
    materialCategories: await db.select().from(materialCategories),
    matieres: await db.select().from(matieres),
    itemTechnicalComponents: await db.select().from(itemTechnicalComponents),
    activityLogs: await db.select().from(activityLogs),
    modificationLogs: await db.select().from(modificationLogs),
    notifications: await db.select().from(notifications),
    photometricStudies: await db.select().from(photometricStudies),
    photometricStudyItems: await db.select().from(photometricStudyItems),
    // Module Recouvrement
    recouvrementStates: await db.select().from(recouvrementStates),
    clientRecouvrementStates: await db.select().from(clientRecouvrementStates),
    clientRecouvrementLogs: await db.select().from(clientRecouvrementLogs),
    // Configuration (couleurs, réglages d'affichage, compteurs de numérotation)
    systemSettings: await db.select().from(systemSettings),
    appColors: await db.select().from(appColors),
    orderCounters: await db.select().from(orderCounters),
    // Module Archive commandes
    archiveSheets: await db.select().from(archiveSheets),
    archiveRows: await db.select().from(archiveRows),
    archiveCellColors: await db.select().from(archiveCellColors),
    // Planning de production journalier
    factories: await db.select().from(factories),
    storageConfig: await db.select().from(storageConfig),
    productionPlanEntries: await db.select().from(productionPlanEntries),
  };

  const totalRecords = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
  return { data, totalRecords };
}
