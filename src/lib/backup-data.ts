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
  archiveSheets, archiveRows, archiveCellColors, archiveCellModifications, driveDocuments,
  productionPlanEntries, factories, storageConfig, articleFamilyCatalog, articleFamilyAssignments,
} from "@/db/schema";

export async function collectBackupData(executor: Pick<typeof db, "select"> = db) {
  const data = {
    // CORRECTIF SÉCURITÉ (R8) : les sauvegardes JSON ne contiennent JAMAIS
    // les condensats de mots de passe. À la restauration, les comptes
    // concernés reçoivent un mot de passe temporaire + mustChangePassword.
    users: (await executor.select().from(users)).map(({ passwordHash, ...safeUser }) => ({
      ...safeUser,
      passwordHash: null, // jamais exporté (champ conservé pour compat restauration)
    })) as unknown as (typeof users.$inferSelect)[],
    agencies: await executor.select().from(agencies),
    userAgencyAccess: await executor.select().from(userAgencyAccess),
    clients: await executor.select().from(clients),
    orders: await executor.select().from(orders),
    orderItems: await executor.select().from(orderItems),
    productionBatches: await executor.select().from(productionBatches),
    expeditionBatches: await executor.select().from(expeditionBatches),
    expeditionPlanEntries: await executor.select().from(expeditionPlanEntries),
    productionUnitLib: await executor.select().from(productionUnitLib),
    articleLibrary: await executor.select().from(articleLibrary),
    techLibrary: await executor.select().from(techLibrary),
    materialCategories: await executor.select().from(materialCategories),
    matieres: await executor.select().from(matieres),
    itemTechnicalComponents: await executor.select().from(itemTechnicalComponents),
    activityLogs: await executor.select().from(activityLogs),
    modificationLogs: await executor.select().from(modificationLogs),
    notifications: await executor.select().from(notifications),
    photometricStudies: await executor.select().from(photometricStudies),
    photometricStudyItems: await executor.select().from(photometricStudyItems),
    // Module Recouvrement
    recouvrementStates: await executor.select().from(recouvrementStates),
    clientRecouvrementStates: await executor.select().from(clientRecouvrementStates),
    clientRecouvrementLogs: await executor.select().from(clientRecouvrementLogs),
    // Catalogue des familles d'articles et affectations manuelles
    articleFamilyCatalog: await executor.select().from(articleFamilyCatalog),
    articleFamilyAssignments: await executor.select().from(articleFamilyAssignments),
    // Configuration (couleurs, réglages d'affichage, compteurs de numérotation)
    systemSettings: await executor.select().from(systemSettings),
    appColors: await executor.select().from(appColors),
    orderCounters: await executor.select().from(orderCounters),
    // Module Archive commandes
    archiveSheets: await executor.select().from(archiveSheets),
    archiveRows: await executor.select().from(archiveRows),
    archiveCellColors: await executor.select().from(archiveCellColors),
    archiveCellModifications: await executor.select().from(archiveCellModifications),
    // Associations uniquement : les fichiers physiques restent dans Google Drive.
    driveDocuments: await executor.select().from(driveDocuments),
    // Planning de production journalier
    factories: await executor.select().from(factories),
    storageConfig: await executor.select().from(storageConfig),
    productionPlanEntries: await executor.select().from(productionPlanEntries),
  };

  const totalRecords = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
  return { data, totalRecords };
}
