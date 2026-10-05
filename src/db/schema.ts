import { pgTable, serial, text, integer, boolean, timestamp, doublePrecision, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("commercial"),
  fullName: text("full_name").notNull(),
  active: boolean("active").notNull().default(true),
  darkMode: boolean("dark_mode").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const agencies = pgTable("agencies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  code: text("code").notNull().unique(),
  address: text("address"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  code: text("code").notNull().unique(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  orderDate: text("order_date").notNull().default(sql`to_char(now(), 'YYYY-MM-DD')`),
  priority: text("priority").notNull().default("NORMALE"),
  clientId: integer("client_id").notNull().references(() => clients.id),
  agencyId: integer("agency_id").notNull().references(() => agencies.id),
  status: text("status").notNull().default("PREVISION"),
  productionStatus: text("production_status").notNull().default("EN_INSTANCE"),
  statusReason: text("status_reason"),
  affaire: text("affaire"),
  cancelReason: text("cancel_reason"),
  cancelledBy: text("cancelled_by"),
  cancelledAt: text("cancelled_at"),
  createdBy: integer("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  lockedBy: integer("locked_by"),
  lockedByName: text("locked_by_name"),
  lockedAt: text("locked_at"),
  techCompleted: boolean("tech_completed").default(false),
  planifCompleted: boolean("planif_completed").default(false),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  articleName: text("article_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  note: text("note"),
  clientSpec: text("client_spec"),
  // Famille TÉLÉGESTION : coché par le commercial à la saisie de l'article.
  // Indépendant des composants techniques de télégestion (itemTechnicalComponents) :
  // ce drapeau marque l'appartenance de l'article à la famille, dès la commande.
  isTelegestion: boolean("is_telegestion").notNull().default(false),
  productionUnit: text("production_unit"),
  plannedLoadingDate: text("planned_loading_date"),
  // Tech
  pcb: text("pcb"), pcbBy: text("pcb_by"), pcbAt: text("pcb_at"),
  colorTemperature: text("color_temperature"), colorTempBy: text("color_temp_by"), colorTempAt: text("color_temp_at"),
  lens: text("lens"), lensBy: text("lens_by"), lensAt: text("lens_at"),
  driver: text("driver"), driverBy: text("driver_by"), driverAt: text("driver_at"),
  electricalClass: text("electrical_class"), elecClassBy: text("elec_class_by"), elecClassAt: text("elec_class_at"),
  accessories: text("accessories"), accessoriesBy: text("accessories_by"), accessoriesAt: text("accessories_at"),
  otherTechSpecs: text("other_tech_specs"), otsBy: text("ots_by"), otsAt: text("ots_at"),
  // Cumuls
  producedQty: integer("produced_qty").notNull().default(0),
  deliveredQty: integer("delivered_qty").notNull().default(0),
  deliveryDate: text("delivery_date"),
  unitPrice: doublePrecision("unit_price"),
  description: text("description"),
});

export const productionBatches = pgTable("production_batches", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => orderItems.id),
  orderId: integer("order_id").notNull().references(() => orders.id),
  quantity: integer("quantity").notNull(),
  cumulativeTotal: integer("cumulative_total").notNull(),
  producedBy: text("produced_by").notNull(),
  productionDate: text("production_date").notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const expeditionBatches = pgTable("expedition_batches", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => orderItems.id),
  orderId: integer("order_id").notNull().references(() => orders.id),
  quantity: integer("quantity").notNull(),
  cumulativeTotal: integer("cumulative_total").notNull(),
  driverName: text("driver_name"),
  plannedLoadingDate: text("planned_loading_date"),
  deliveredBy: text("delivered_by").notNull(),
  deliveryDate: text("delivery_date").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const productionUnitLib = pgTable("production_unit_lib", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  usageCount: integer("usage_count").notNull().default(0),
});

export const articleLibrary = pgTable("article_library", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  usageCount: integer("usage_count").notNull().default(0),
});

export const techLibrary = pgTable("tech_library", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  value: text("value").notNull(),
  usageCount: integer("usage_count").notNull().default(0),
});

export const materialCategories = pgTable("material_categories", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull().unique(),
  isTelegestion: boolean("is_telegestion").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const matieres = pgTable("matieres", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").references(() => materialCategories.id, { onDelete: "restrict" }),
  category: text("category").notNull(),
  reference: text("reference").notNull().default("SANS-REF"),
  name: text("name").notNull(),
  stock: doublePrecision("stock").notNull().default(0),
  specs: text("specs"),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const itemTechnicalComponents = pgTable("item_technical_components", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => orderItems.id, { onDelete: "cascade" }),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").references(() => materialCategories.id, { onDelete: "set null" }),
  materialId: integer("material_id").references(() => matieres.id, { onDelete: "set null" }),
  categoryKey: text("category_key").notNull(),
  categoryName: text("category_name").notNull(),
  materialReference: text("material_reference").notNull(),
  materialLabel: text("material_label").notNull(),
  isTelegestion: boolean("is_telegestion").notNull().default(false),
  enteredById: integer("entered_by_id").references(() => users.id, { onDelete: "set null" }),
  enteredByName: text("entered_by_name").notNull(),
  enteredAt: timestamp("entered_at", { mode: "string" }).notNull().defaultNow(),
});

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  username: text("username").notNull(),
  action: text("action").notNull(),
  details: text("details"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const modificationLogs = pgTable("modification_logs", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  userId: integer("user_id").references(() => users.id),
  username: text("username").notNull(),
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  orderId: integer("order_id").references(() => orders.id),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

// Table pour gérer les compteurs de numéros de commande par année
// Permet une génération thread-safe avec FOR UPDATE
export const orderCounters = pgTable("order_counters", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull().unique(),
  lastNumber: integer("last_number").notNull().default(0),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
});

// Table pour la gestion dynamique des couleurs de l'application
// Permet à l'administrateur de personnaliser les couleurs des statuts
export const appColors = pgTable("app_colors", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),          // Ex: "SUR_STOCK", "EN_PRODUCTION"
  category: text("category").notNull(),          // Ex: "commercial", "production", "visual", "priority"
  label: text("label").notNull(),                // Ex: "Sur Stock", "En Production"
  color: text("color").notNull(),                // Code HEX: "#06b6d4"
  description: text("description"),              // Description optionnelle
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
  updatedById: integer("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedByName: text("updated_by_name"),
});

// Table pour les paramètres système (clé-valeur)
export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),              // Ex: "backup_time", "backup_max_count"
  value: text("value").notNull(),                   // Valeur du paramètre
  description: text("description"),                  // Description du paramètre
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
  updatedById: integer("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedByName: text("updated_by_name"),
});

// Table pour l'historique des sauvegardes automatiques
export const backupHistory = pgTable("backup_history", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),              // Nom du fichier généré
  filepath: text("filepath"),                        // Chemin complet (si sauvé localement)
  filesize: integer("filesize"),                     // Taille en octets
  totalRecords: integer("total_records").notNull(),  // Nombre d'enregistrements
  type: text("type").notNull().default("manual"),    // "manual" ou "automatic"
  status: text("status").notNull().default("success"), // "success", "error", "pending"
  errorMessage: text("error_message"),               // Message d'erreur si échec
  backupData: text("backup_data"),                   // Contenu JSON complet de la sauvegarde
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdByName: text("created_by_name"),
});

// Table pour les études photométriques (en-tête)
// Cas 1 : liée à une commande existante (orderId rempli) → affichée sous la commande
// Cas 2 : étude indépendante (orderId null, affaireName rempli) → affichée dans le tableau isolé
export const photometricStudies = pgTable("photometric_studies", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "cascade" }),  // NULL = étude indépendante
  clientId: integer("client_id").references(() => clients.id, { onDelete: "set null" }),
  clientName: text("client_name"),                         // Copie pour historique
  affaireName: text("affaire_name"),                       // Nom d'affaire libre (cas 2)
  studyNumber: text("study_number").notNull(),             // N° de l'étude (saisi manuellement)
  note: text("note"),                                      // Note libre
  createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdByName: text("created_by_name").notNull(),        // Traçabilité du responsable
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
});

// Articles d'une étude photométrique (N articles par étude)
export const photometricStudyItems = pgTable("photometric_study_items", {
  id: serial("id").primaryKey(),
  studyId: integer("study_id").notNull().references(() => photometricStudies.id, { onDelete: "cascade" }),
  productName: text("product_name").notNull(),             // Produit concerné
  lensId: integer("lens_id").references(() => matieres.id, { onDelete: "set null" }),
  lensReference: text("lens_reference"),                   // Copie de la référence pour historique
  lensLabel: text("lens_label"),                           // Copie du libellé pour historique
  note: text("note"),                                      // Note par article
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

// ── Recouvrement (ajout) ────────────────────────────────────────────
// Catalogue dynamique des états de recouvrement.
// colorKey référence une clé de app_colors (catégorie "recouvrement") afin que
// la couleur reste personnalisable depuis l'onglet Couleurs de l'admin.
export const recouvrementStates = pgTable("recouvrement_states", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),                     // Ex: "EN_RETARD", "RELANCE_1"
  label: text("label").notNull(),                          // Ex: "En retard"
  description: text("description"),
  colorKey: text("color_key").notNull().default("RECOUVREMENT_GRAY"), // clé app_colors
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
});

// État de recouvrement courant d'un client (1 état max par client)
export const clientRecouvrementStates = pgTable("client_recouvrement_states", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().unique().references(() => clients.id, { onDelete: "cascade" }),
  stateId: integer("state_id").notNull().references(() => recouvrementStates.id, { onDelete: "restrict" }),
  note: text("note"),
  updatedById: integer("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedByName: text("updated_by_name"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
});

// ── Stockage Google Drive (configuration CENTRALISÉE, une seule ligne) ──
// Un unique compte Google sert d'espace de stockage à toute la plateforme.
// Les secrets (client secret, refresh token) sont CHIFFRÉS au repos
// (AES-256-GCM, cf. src/lib/crypto.ts) et ne sont JAMAIS renvoyés au frontend.
export const storageConfig = pgTable("storage_config", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("google_drive"),
  // Identifiants OAuth de l'application (saisis par l'admin ou via variables d'env)
  clientId: text("client_id"),
  encryptedClientSecret: text("encrypted_client_secret"),
  // Compte Google connecté + jeton de rafraîchissement (chiffré)
  googleAccountEmail: text("google_account_email"),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  // Dossier racine du stockage sur le Drive
  rootFolderId: text("root_folder_id"),
  rootFolderName: text("root_folder_name").notNull().default("ORDERTRACK STORAGE"),
  // disconnected | connected | expired
  status: text("status").notNull().default("disconnected"),
  lastError: text("last_error"),
  connectedAt: text("connected_at"),
  lastSyncAt: text("last_sync_at"),
  connectedById: integer("connected_by_id").references(() => users.id, { onDelete: "set null" }),
  connectedByName: text("connected_by_name"),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
});

// ── Usines (unités de production) ───────────────────────────────────
// Chaque usine possède son propre planning de production.
// Le NOM de l'usine est recopié dans order_items.production_unit lors de la
// planification, afin que le tableau des commandes et l'export Excel
// continuent d'afficher l'unité de production exactement comme avant.
export const factories = pgTable("factories", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull().unique(),
  // Responsable d'usine : obligatoirement un utilisateur de la plateforme
  responsableId: integer("responsable_id").references(() => users.id, { onDelete: "restrict" }),
  responsableName: text("responsable_name"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
});

// ── Planning de production journalier (module planification) ────────
// Chaque ligne = un article planifié pour une journée donnée.
// N'altère JAMAIS directement order_items : la quantité n'est appliquée à la
// production réelle qu'au passage au statut TERMINE, via la même logique que
// l'onglet Production (src/lib/production-apply.ts), et une seule fois
// (garde d'idempotence appliedQty / appliedAt).
export const productionPlanEntries = pgTable("production_plan_entries", {
  id: serial("id").primaryKey(),
  planDate: text("plan_date").notNull(),              // Journée planifiée (YYYY-MM-DD)
  // Usine concernée : chaque usine a son propre planning journalier
  factoryId: integer("factory_id").references(() => factories.id, { onDelete: "set null" }),
  factoryName: text("factory_name"),                  // Copie pour l'historique
  itemId: integer("item_id").notNull().references(() => orderItems.id, { onDelete: "cascade" }),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  // Copies pour l'historique et l'affichage (même approche que les composants techniques)
  articleName: text("article_name").notNull(),
  orderNumber: text("order_number"),
  clientName: text("client_name"),
  plannedQty: integer("planned_qty").notNull().default(0),
  // EN_ATTENTE (neutre, par défaut) | EN_COURS | SUSPENDU | ANNULE | TERMINE
  status: text("status").notNull().default("EN_ATTENTE"),
  reason: text("reason"),                             // Motif de suspension / annulation
  appliedQty: integer("applied_qty").notNull().default(0),  // Quantité réellement appliquée en production
  appliedAt: text("applied_at"),                      // Date d'application (idempotence)
  createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdByName: text("created_by_name"),
  updatedByName: text("updated_by_name"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
});

// ── Archive commandes (module indépendant) ──────────────────────────
// Données historiques importées depuis Excel. STRICTEMENT SÉPARÉES des
// commandes actives (tables orders / order_items) : aucune FK vers celles-ci.
// Une "feuille" = une période du classeur Excel d'origine.
export const archiveSheets = pgTable("archive_sheets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),            // Nom de la feuille Excel (= période)
  sourceFilename: text("source_filename"),          // Nom du fichier importé
  sheetIndex: integer("sheet_index").notNull().default(0), // Ordre d'origine des feuilles
  columns: text("columns").notNull(),               // JSON: string[] — en-têtes, ORDRE PRÉSERVÉ
  preamble: text("preamble"),                       // JSON: string[][] — lignes complémentaires avant l'en-tête
  resteColumnIndex: integer("reste_column_index"),  // Index de la colonne "Reste à livrer" si détectée
  clientsColumnIndex: integer("clients_column_index"), // Index de la colonne "Clients" (fusion verticale)
  affaireColumnIndex: integer("affaire_column_index"), // Index de la colonne "Affaire" (fusion verticale)
  stateColumnIndex: integer("state_column_index"),     // Index d'une colonne "État" présente dans le fichier
  rowCount: integer("row_count").notNull().default(0),
  importedById: integer("imported_by_id").references(() => users.id, { onDelete: "set null" }),
  importedByName: text("imported_by_name"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

// Une ligne d'archive = le contenu brut d'une ligne Excel (cellules vides conservées)
export const archiveRows = pgTable("archive_rows", {
  id: serial("id").primaryKey(),
  sheetId: integer("sheet_id").notNull().references(() => archiveSheets.id, { onDelete: "cascade" }),
  rowIndex: integer("row_index").notNull(),         // Position d'origine dans la feuille
  cells: text("cells").notNull(),                   // JSON: string[] aligné sur columns
  // État LU DANS LE FICHIER Excel à l'import (colonne "État" du classeur).
  // Sert de valeur de départ ; reste modifiable via stateOverride.
  stateDetected: text("state_detected"),
  // État manuel défini par l'administrateur (prioritaire). NULL = on retombe
  // sur l'état du fichier, puis sur la règle Reste à livrer = 0 → LIVRE.
  // Une cellule vide n'est jamais interprétée comme 0.
  stateOverride: text("state_override"),
  updatedById: integer("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedByName: text("updated_by_name"),
  updatedAt: timestamp("updated_at", { mode: "string" }),
});

// Couleur personnalisée d'UNE cellule précise (prioritaire sur la couleur de ligne).
// Unicité garantie par (rowId, columnIndex) : deux cellules identiques de
// commandes différentes ne partagent jamais leur configuration.
export const archiveCellColors = pgTable("archive_cell_colors", {
  id: serial("id").primaryKey(),
  sheetId: integer("sheet_id").notNull().references(() => archiveSheets.id, { onDelete: "cascade" }),
  rowId: integer("row_id").notNull().references(() => archiveRows.id, { onDelete: "cascade" }),
  columnIndex: integer("column_index").notNull(),
  color: text("color").notNull(),                   // HEX #RRGGBB
  updatedById: integer("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedByName: text("updated_by_name"),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("archive_cell_colors_row_col_uq").on(table.rowId, table.columnIndex)]);

// Historique des changements d'état de recouvrement (traçabilité, style activity_logs)
export const clientRecouvrementLogs = pgTable("client_recouvrement_logs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  stateId: integer("state_id").references(() => recouvrementStates.id, { onDelete: "set null" }),
  stateLabel: text("state_label"),                         // Copie du libellé pour historique
  note: text("note"),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  username: text("username").notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

// ── Documents contextuels (gestion documentaire basée sur le Stockage) ──
// Association LOGIQUE entre un fichier Google Drive existant et une entité
// métier (commande OU étude photométrique). Le fichier physique reste géré
// par le module Stockage (dossier racine ORDERTRACK STORAGE) : jamais de
// duplication physique — une seule copie Drive, N associations possibles.
// Exactly one of order_id / study_id is set (contrôle effectué côté API).
export const driveDocuments = pgTable("drive_documents", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "cascade" }),
  studyId: integer("study_id").references(() => photometricStudies.id, { onDelete: "cascade" }),
  driveFileId: text("drive_file_id").notNull(),           // Identifiant Google Drive
  driveFolderId: text("drive_folder_id"),                 // Dossier physique (traçabilité)
  fileName: text("file_name").notNull(),                  // Copie pour l'affichage
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),                         // Octets
  webViewLink: text("web_view_link"),                     // Lien de visualisation Drive
  // Catégorie texte extensible (cf. src/lib/document-categories.ts)
  category: text("category").notNull().default("AUTRE"),
  uploadedById: integer("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
  uploadedByName: text("uploaded_by_name").notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
}, (table) => [
  // Un même fichier Drive ne peut être associé qu'une fois à une même entité.
  // (order_id/study_id NULL restent distincts en PostgreSQL — pas de conflit.)
  uniqueIndex("drive_documents_order_file_uq").on(table.orderId, table.driveFileId),
  uniqueIndex("drive_documents_study_file_uq").on(table.studyId, table.driveFileId),
  // Index de recherche par entité (N documents par entité).
  index("drive_documents_order_idx").on(table.orderId),
  index("drive_documents_study_idx").on(table.studyId),
]);
