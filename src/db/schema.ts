import { pgTable, serial, text, integer, boolean, timestamp, doublePrecision, uniqueIndex, index, uuid, primaryKey, date, jsonb, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("commercial"),
  fullName: text("full_name").notNull(),
  active: boolean("active").notNull().default(true),
  darkMode: boolean("dark_mode").notNull().default(false),
  // CORRECTIF SÉCURITÉ (R2) : à true, l'utilisateur doit choisir un nouveau
  // mot de passe avant tout accès aux modules (compte semé, créé par admin,
  // ou mot de passe réinitialisé par admin).
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

/** Présence éphémère par onglet : exclue des exports et restaurations. */
export const userPresence = pgTable("user_presence", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull(),
  lastSeen: timestamp("last_seen", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [primaryKey({ name: "user_presence_pkey", columns: [table.userId, table.clientId] })]);

export const agencies = pgTable("agencies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  code: text("code").notNull().unique(),
  address: text("address"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

// Accès agence optionnel attribué par le superadmin.
// Sans ligne pour un utilisateur : aucune restriction (compatibilité existante).
// Avec une ou plusieurs lignes : seules ces agences sont visibles sur les
// commandes et les vues dérivées.
export const userAgencyAccess = pgTable("user_agency_access", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  agencyId: integer("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("user_agency_access_user_agency_unique").on(table.userId, table.agencyId),
  index("user_agency_access_user_idx").on(table.userId),
  index("user_agency_access_agency_idx").on(table.agencyId),
]);

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
}, (table) => [
  // CORRECTIF PERF (P1) : index sur les filtres et jointures fréquents.
  index("orders_client_idx").on(table.clientId),
  index("orders_agency_idx").on(table.agencyId),
  index("orders_production_status_idx").on(table.productionStatus),
  index("orders_created_at_idx").on(table.createdAt),
]);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  articleName: text("article_name").notNull(),
  // ÉVOLUTION ÉTUDES (§7) : référence article (ex. NLX100) — recherche intelligente.
  // NULLable : les articles existants restent valides sans migration de données.
  reference: text("reference"),
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
}, (table) => [
  // CORRECTIF PERF (P1) : toutes les requêtes articles filtrent par order_id.
  index("order_items_order_idx").on(table.orderId),
]);

export const productionBatches = pgTable("production_batches", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => orderItems.id),
  orderId: integer("order_id").notNull().references(() => orders.id),
  quantity: integer("quantity").notNull(),
  cumulativeTotal: integer("cumulative_total").notNull(),
  producedBy: text("produced_by").notNull(),
  productionDate: text("production_date").notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
}, (table) => [
  index("production_batches_item_idx").on(table.itemId),
  index("production_batches_order_idx").on(table.orderId),
]);

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
}, (table) => [
  index("expedition_batches_item_idx").on(table.itemId),
  index("expedition_batches_order_idx").on(table.orderId),
]);

// Planning d'expédition journalier. Cette table prépare les chargements sans
// modifier les quantités réellement livrées : seule l'API /api/expedition
// écrit dans order_items.delivered_qty et expedition_batches.
export const expeditionPlanEntries = pgTable("expedition_plan_entries", {
  id: serial("id").primaryKey(),
  planDate: text("plan_date").notNull(),
  itemId: integer("item_id").notNull().references(() => orderItems.id, { onDelete: "cascade" }),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  articleName: text("article_name").notNull(),
  orderNumber: text("order_number"),
  clientName: text("client_name"),
  plannedQty: integer("planned_qty").notNull().default(0),
  loadedQty: integer("loaded_qty").notNull().default(0),
  driverName: text("driver_name").notNull(),
  status: text("status").notNull().default("NON_TRAITE"),
  note: text("note"),
  createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdByName: text("created_by_name"),
  updatedByName: text("updated_by_name"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
}, (table) => [
  index("expedition_plan_entries_date_driver_idx").on(table.planDate, table.driverName),
  index("expedition_plan_entries_item_idx").on(table.itemId),
  index("expedition_plan_entries_status_idx").on(table.status),
]);

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
}, (table) => [
  index("item_technical_components_item_idx").on(table.itemId),
  index("item_technical_components_order_idx").on(table.orderId),
]);

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  username: text("username").notNull(),
  action: text("action").notNull(),
  details: text("details"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
}, (table) => [
  index("activity_logs_user_idx").on(table.userId),
  index("activity_logs_created_at_idx").on(table.createdAt),
]);

export const modificationLogs = pgTable("modification_logs", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  userId: integer("user_id").references(() => users.id),
  username: text("username").notNull(),
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
}, (table) => [
  index("modification_logs_order_idx").on(table.orderId),
]);

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  // eventKey identifie l'événement métier à l'origine de la notification.
  // type reste conservé comme niveau de gravité pour compatibilité client.
  eventKey: text("event_key").notNull().default("LEGACY_INFO"),
  type: text("type").notNull().default("info"),
  severity: text("severity").notNull().default("info"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  orderId: integer("order_id").references(() => orders.id),
  targetTab: text("target_tab"),
  read: boolean("read").notNull().default(false),
  readAt: timestamp("read_at", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
}, (table) => [
  index("notifications_user_read_idx").on(table.userId, table.read),
  index("notifications_user_created_idx").on(table.userId, table.createdAt),
  index("notifications_order_idx").on(table.orderId),
]);

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
}, (table) => [
  index("photometric_studies_order_idx").on(table.orderId),
]);

// Articles d'une étude photométrique (N articles par étude)
export const photometricStudyItems = pgTable("photometric_study_items", {
  id: serial("id").primaryKey(),
  studyId: integer("study_id").notNull().references(() => photometricStudies.id, { onDelete: "cascade" }),
  // ÉVOLUTION ÉTUDES (§3-§5) : lien STRICT vers l'article réel de la commande.
  // NULL = étude indépendante (cas 2) OU ligne historique (avant l'évolution).
  // SET NULL : si l'article disparaît, productName (snapshot) préserve l'historique.
  orderItemId: integer("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(),             // Produit concerné (snapshot serveur en mode commande)
  // ÉVOLUTION ÉTUDES (§10-§21) : lens_id (EXISTANT) devient officiellement
  // l'OVERRIDE imposé par l'étude — priorité absolue sur order_items.lens
  // pour la résolution de l'étude (cf. src/lib/study-lens.ts). Lorsqu'une
  // étude est liée à une commande, l'API recopie aussi la référence dans la
  // colonne technique existante order_items.lens, sans créer de composant.
  lensId: integer("lens_id").references(() => matieres.id, { onDelete: "set null" }),
  lensReference: text("lens_reference"),                   // Copie de la référence pour historique
  lensLabel: text("lens_label"),                           // Copie du libellé pour historique
  note: text("note"),                                      // Note par article
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
}, (table) => [
  index("photometric_study_items_study_idx").on(table.studyId),
  index("photometric_study_items_order_item_idx").on(table.orderItemId),
]);

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
// Le NOM de l'usine est recopié dans order_items.production_unit lors de
// la présélection/modification par le service planification ou lors de
// l'ajout au planning, afin que le tableau des commandes et l'export Excel
// affichent la même unité de production.
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
}, (table) => [
  index("production_plan_entries_date_factory_idx").on(table.planDate, table.factoryId),
  index("production_plan_entries_status_idx").on(table.status),
  index("production_plan_entries_item_idx").on(table.itemId),
]);

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
}, (table) => [
  index("archive_rows_sheet_idx").on(table.sheetId),
]);

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

// Marquage « modifié par un commercial » : une ligne par cellule modifiée.
// Distinct de archive_cell_colors (couleurs personnalisées du superadmin).
export const archiveCellModifications = pgTable("archive_cell_modifications", {
  id: serial("id").primaryKey(),
  sheetId: integer("sheet_id").notNull().references(() => archiveSheets.id, { onDelete: "cascade" }),
  rowId: integer("row_id").notNull().references(() => archiveRows.id, { onDelete: "cascade" }),
  columnIndex: integer("column_index").notNull(),
  modifiedById: integer("modified_by_id").references(() => users.id, { onDelete: "set null" }),
  modifiedByName: text("modified_by_name"),
  modifiedAt: timestamp("modified_at", { mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("archive_cell_modifications_row_col_uq").on(table.rowId, table.columnIndex)]);

// Catalogue des familles d'articles (géré par le superadmin).
// Hiérarchie : FAMILLE (catégorie) > SOUS FAMILLE (famille commerciale) > VARIANTE.
// variant vaut "" lorsqu'il n'y a pas de variante.
export const articleFamilyCatalog = pgTable("article_family_catalog", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  subFamily: text("sub_family").notNull(),
  variant: text("variant").notNull().default(""),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("article_family_catalog_uq").on(table.category, table.subFamily, table.variant)]);

// Affectation MANUELLE d'une désignation originale à une famille du catalogue.
// Clé = désignation exacte : aucune donnée de commande n'est modifiée.
export const articleFamilyAssignments = pgTable("article_family_assignments", {
  id: serial("id").primaryKey(),
  designation: text("designation").notNull(),
  catalogId: integer("catalog_id").notNull().references(() => articleFamilyCatalog.id, { onDelete: "cascade" }),
  assignedByName: text("assigned_by_name"),
  assignedAt: timestamp("assigned_at", { mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("article_family_assignments_designation_uq").on(table.designation)]);

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
}, (table) => [
  index("client_recouvrement_logs_client_idx").on(table.clientId),
]);

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

// DELIVERY PERFORMANCE — schéma additif, sans activation automatique du module.
// Les jours/horaires sont configurés ; aucun ancien lot n'est réputé accepté par défaut.
const dpmCreated = () => ({
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  createdById: integer("created_by_id").notNull().references(() => users.id, { onDelete: "restrict" }),
});
export const dpmCalendars = pgTable("dpm_calendars", {
  id: serial("id").primaryKey(), calendarKey: text("calendar_key").notNull(), version: integer("version").notNull(),
  name: text("name").notNull(), timezone: text("timezone").notNull().default("Africa/Tunis"),
  workingWeekdays: jsonb("working_weekdays").$type<number[]>().notNull().default(sql`'[1,2,3,4,5,6]'::jsonb`),
  // ISO weekday -> plages [{start:'08:00', end:'12:00'}]. Aucune journée de huit heures implicite.
  workingIntervals: jsonb("working_intervals").notNull().default(sql`'{}'::jsonb`),
  effectiveFrom: date("effective_from").notNull(), publishedAt: timestamp("published_at", { withTimezone: true, mode: "string" }),
  publishedById: integer("published_by_id").references(() => users.id, { onDelete: "restrict" }),
  publicationReason: text("publication_reason"),
  ...dpmCreated(),
}, t => [uniqueIndex("dpm_calendars_key_version_uq").on(t.calendarKey, t.version),
  check("dpm_calendars_version_ck", sql`${t.version} > 0`),
  check("dpm_calendars_publication_ck", sql`(${t.publishedAt} IS NULL AND ${t.publishedById} IS NULL AND ${t.publicationReason} IS NULL) OR (${t.publishedAt} IS NOT NULL AND ${t.publishedById} IS NOT NULL AND length(trim(${t.publicationReason})) > 0)`),
  check("dpm_calendars_json_ck", sql`jsonb_typeof(${t.workingWeekdays}) = 'array' AND jsonb_typeof(${t.workingIntervals}) = 'object'`)]);
export const dpmCalendarDays = pgTable("dpm_calendar_days", {
  id: serial("id").primaryKey(), calendarId: integer("calendar_id").notNull().references(() => dpmCalendars.id, { onDelete: "restrict" }),
  day: date("day").notNull(), working: boolean("working").notNull(), intervals: jsonb("intervals").notNull().default(sql`'[]'::jsonb`),
  reason: text("reason").notNull(), source: text("source").notNull(),
  validatedById: integer("validated_by_id").references(() => users.id, { onDelete: "restrict" }),
  validatedAt: timestamp("validated_at", { withTimezone: true, mode: "string" }), ...dpmCreated(),
}, t => [uniqueIndex("dpm_calendar_days_day_uq").on(t.calendarId, t.day),
  check("dpm_calendar_days_validation_ck", sql`(${t.validatedAt} IS NULL) = (${t.validatedById} IS NULL)`),
  check("dpm_calendar_days_source_ck", sql`length(trim(${t.reason})) > 0 AND length(trim(${t.source})) > 0 AND jsonb_typeof(${t.intervals}) = 'array'`)]);
export const dpmSiteSettings = pgTable("dpm_site_settings", {
  id: serial("id").primaryKey(), factoryId: integer("factory_id").notNull().references(() => factories.id, { onDelete: "restrict" }),
  reportingCode: text("reporting_code").notNull(), regionCode: text("region_code").notNull(),
  calendarId: integer("calendar_id").references(() => dpmCalendars.id, { onDelete: "restrict" }),
  enabled: boolean("enabled").notNull().default(false), ...dpmCreated(),
}, t => [uniqueIndex("dpm_site_settings_factory_uq").on(t.factoryId), uniqueIndex("dpm_site_settings_code_uq").on(t.reportingCode),
  check("dpm_site_settings_code_ck", sql`length(trim(${t.reportingCode})) > 0 AND length(trim(${t.regionCode})) > 0`),
  check("dpm_site_settings_calendar_ck", sql`NOT ${t.enabled} OR ${t.calendarId} IS NOT NULL`)]);
export const dpmGrants = pgTable("dpm_grants", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  // NULL = habilitation explicitement globale, jamais accordée par défaut.
  factoryId: integer("factory_id").references(() => factories.id, { onDelete: "restrict" }),
  capability: text("capability").notNull(), active: boolean("active").notNull().default(true), ...dpmCreated(),
}, t => [uniqueIndex("dpm_grants_site_uq").on(t.userId, t.factoryId, t.capability).where(sql`${t.factoryId} IS NOT NULL`),
  uniqueIndex("dpm_grants_global_uq").on(t.userId, t.capability).where(sql`${t.factoryId} IS NULL`),
  check("dpm_grants_capability_ck", sql`${t.capability} IN ('READ','DECLARE','TECHNICAL_REVIEW','IMPACT_ANALYSIS','LOGISTICS_REVIEW','INDUSTRIAL_APPROVAL','CONFIGURE')`)]);
export const dpmCommitments = pgTable("dpm_commitments", {
  id: serial("id").primaryKey(), orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  version: integer("version").notNull(), previousId: integer("previous_id").references((): AnyPgColumn => dpmCommitments.id, { onDelete: "restrict" }),
  approvalFactoryId: integer("approval_factory_id").references(() => factories.id, { onDelete: "restrict" }),
  originalOrderDate: date("original_order_date").notNull(), confirmedDueDate: date("confirmed_due_date").notNull(),
  calendarId: integer("calendar_id").notNull().references(() => dpmCalendars.id, { onDelete: "restrict" }),
  // Instantané des quantités convenues par article pour la version contractuelle.
  agreedItems: jsonb("agreed_items").notNull(), reason: text("reason").notNull(), clientRequested: boolean("client_requested").notNull().default(false),
  proofDocumentId: integer("proof_document_id").references(() => driveDocuments.id, { onDelete: "restrict" }),
  decision: text("decision").notNull().default("PENDING"),
  validatedById: integer("validated_by_id").references(() => users.id, { onDelete: "restrict" }),
  validatedAt: timestamp("validated_at", { withTimezone: true, mode: "string" }), ...dpmCreated(),
}, t => [uniqueIndex("dpm_commitments_version_uq").on(t.orderId, t.version), index("dpm_commitments_due_idx").on(t.confirmedDueDate, t.decision),
  check("dpm_pending_approval_site_ck", sql`${t.decision} <> 'PENDING' OR ${t.approvalFactoryId} IS NOT NULL`),
  check("dpm_commitments_version_ck", sql`${t.version} > 0 AND ((${t.version} = 1 AND ${t.previousId} IS NULL) OR (${t.version} > 1 AND ${t.previousId} IS NOT NULL))`),
  check("dpm_commitments_decision_ck", sql`${t.decision} IN ('PENDING','APPROVED','REJECTED') AND jsonb_typeof(${t.agreedItems}) = 'array' AND jsonb_array_length(${t.agreedItems}) > 0 AND length(trim(${t.reason})) > 0`),
  check("dpm_commitments_validation_ck", sql`(${t.decision} = 'PENDING' AND ${t.validatedAt} IS NULL AND ${t.validatedById} IS NULL) OR (${t.decision} <> 'PENDING' AND ${t.validatedAt} IS NOT NULL AND ${t.validatedById} IS NOT NULL AND ${t.proofDocumentId} IS NOT NULL)`)]);
export const dpmDeliveries = pgTable("dpm_deliveries", {
  id: serial("id").primaryKey(), orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  number: text("number").notNull(), dispatchFactoryId: integer("dispatch_factory_id").notNull().references(() => factories.id, { onDelete: "restrict" }),
  deliveryNoteReference: text("delivery_note_reference"), actualDeliveryAt: timestamp("actual_delivery_at", { withTimezone: true, mode: "string" }),
  requestKey: uuid("request_key").notNull(), ...dpmCreated(),
}, t => [uniqueIndex("dpm_deliveries_number_uq").on(t.dispatchFactoryId, t.number), uniqueIndex("dpm_deliveries_request_uq").on(t.requestKey),
  index("dpm_deliveries_order_idx").on(t.orderId), check("dpm_deliveries_number_ck", sql`length(trim(${t.number})) > 0`)]);
export const dpmDeliveryLines = pgTable("dpm_delivery_lines", {
  id: serial("id").primaryKey(), deliveryId: integer("delivery_id").notNull().references(() => dpmDeliveries.id, { onDelete: "restrict" }),
  itemId: integer("item_id").notNull().references(() => orderItems.id, { onDelete: "restrict" }),
  manufacturingFactoryId: integer("manufacturing_factory_id").notNull().references(() => factories.id, { onDelete: "restrict" }),
  commitmentId: integer("commitment_id").notNull().references(() => dpmCommitments.id, { onDelete: "restrict" }),
  plannedQty: integer("planned_qty").notNull(), dueDate: date("due_date").notNull(), ...dpmCreated(),
}, t => [uniqueIndex("dpm_delivery_lines_item_uq").on(t.deliveryId, t.itemId, t.manufacturingFactoryId), index("dpm_delivery_lines_due_idx").on(t.dueDate),
  check("dpm_delivery_lines_quantity_ck", sql`${t.plannedQty} > 0`)]);
export const dpmDeliveryMovements = pgTable("dpm_delivery_movements", {
  id: serial("id").primaryKey(), lineId: integer("line_id").notNull().references(() => dpmDeliveryLines.id, { onDelete: "restrict" }),
  batchId: integer("batch_id").notNull().references(() => expeditionBatches.id, { onDelete: "restrict" }), ...dpmCreated(),
}, t => [uniqueIndex("dpm_delivery_movements_batch_uq").on(t.batchId), index("dpm_delivery_movements_line_idx").on(t.lineId)]);
export const dpmReceipts = pgTable("dpm_receipts", {
  id: serial("id").primaryKey(), lineId: integer("line_id").notNull().references(() => dpmDeliveryLines.id, { onDelete: "restrict" }),
  reference: text("reference").notNull(), receivedAt: timestamp("received_at", { withTimezone: true, mode: "string" }).notNull(),
  receivedQty: integer("received_qty").notNull(), acceptedQty: integer("accepted_qty").notNull().default(0), rejectedQty: integer("rejected_qty").notNull().default(0),
  status: text("status").notNull().default("PENDING"), correctionOfId: integer("correction_of_id").references((): AnyPgColumn => dpmReceipts.id, { onDelete: "restrict" }),
  proofDocumentId: integer("proof_document_id").references(() => driveDocuments.id, { onDelete: "restrict" }),
  validatedById: integer("validated_by_id").references(() => users.id, { onDelete: "restrict" }),
  validatedAt: timestamp("validated_at", { withTimezone: true, mode: "string" }), requestKey: uuid("request_key").notNull(), ...dpmCreated(),
}, t => [uniqueIndex("dpm_receipts_reference_uq").on(t.lineId, t.reference), uniqueIndex("dpm_receipts_request_uq").on(t.requestKey),
  uniqueIndex("dpm_receipts_correction_uq").on(t.correctionOfId).where(sql`${t.correctionOfId} IS NOT NULL`),
  check("dpm_receipts_quantity_ck", sql`${t.receivedQty} >= 0 AND ${t.acceptedQty} >= 0 AND ${t.rejectedQty} >= 0 AND ${t.acceptedQty} + ${t.rejectedQty} <= ${t.receivedQty}`),
  check("dpm_receipts_status_ck", sql`${t.status} IN ('PENDING','ACCEPTED','PARTIAL','REJECTED')`),
  check("dpm_receipts_validation_ck", sql`(${t.status} = 'PENDING' AND ${t.acceptedQty} = 0 AND ${t.rejectedQty} = 0 AND ${t.validatedAt} IS NULL AND ${t.validatedById} IS NULL) OR (${t.status} <> 'PENDING' AND ${t.validatedAt} IS NOT NULL AND ${t.validatedById} IS NOT NULL AND ${t.proofDocumentId} IS NOT NULL)`)]);
export const dpmEvents = pgTable("dpm_events", {
  id: serial("id").primaryKey(), reference: text("reference").notNull(), version: integer("version").notNull().default(1),
  correctionOfId: integer("correction_of_id").references((): AnyPgColumn => dpmEvents.id, { onDelete: "restrict" }),
  factoryId: integer("factory_id").notNull().references(() => factories.id, { onDelete: "restrict" }),
  origin: text("origin").notNull(), category: text("category").notNull(), subcategory: text("subcategory"),
  startsAt: timestamp("starts_at", { withTimezone: true, mode: "string" }).notNull(), endsAt: timestamp("ends_at", { withTimezone: true, mode: "string" }),
  resourceKey: text("resource_key").notNull(), productionStopped: boolean("production_stopped").notNull().default(false),
  detailedCause: text("detailed_cause").notNull(), requestKey: uuid("request_key").notNull(), ...dpmCreated(),
}, t => [uniqueIndex("dpm_events_reference_uq").on(t.reference), uniqueIndex("dpm_events_correction_uq").on(t.correctionOfId).where(sql`${t.correctionOfId} IS NOT NULL`), uniqueIndex("dpm_events_request_uq").on(t.requestKey),
  index("dpm_events_factory_start_idx").on(t.factoryId, t.startsAt), check("dpm_events_origin_ck", sql`${t.origin} IN ('INTERNAL','EXTERNAL')`),
  check("dpm_events_dates_ck", sql`${t.endsAt} IS NULL OR ${t.endsAt} >= ${t.startsAt}`), check("dpm_events_version_ck", sql`${t.version} > 0`)]);
export const dpmEventImpacts = pgTable("dpm_event_impacts", {
  id: serial("id").primaryKey(), eventId: integer("event_id").notNull().references(() => dpmEvents.id, { onDelete: "restrict" }),
  eventVersion: integer("event_version").notNull(), orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  commitmentId: integer("commitment_id").notNull().references(() => dpmCommitments.id, { onDelete: "restrict" }),
  criticalPathKey: text("critical_path_key").notNull(), startsAt: timestamp("starts_at", { withTimezone: true, mode: "string" }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true, mode: "string" }).notNull(), demonstratedImpact: text("demonstrated_impact").notNull(),
  claimedMinutes: integer("claimed_minutes").notNull(), admissibleMinutes: integer("admissible_minutes").notNull().default(0),
  decision: text("decision").notNull().default("PENDING"), validatorComment: text("validator_comment"),
  proofDocumentId: integer("proof_document_id").references(() => driveDocuments.id, { onDelete: "restrict" }),
  validatedById: integer("validated_by_id").references(() => users.id, { onDelete: "restrict" }),
  validatedAt: timestamp("validated_at", { withTimezone: true, mode: "string" }), ...dpmCreated(),
}, t => [index("dpm_event_impacts_order_idx").on(t.orderId, t.decision),
  uniqueIndex("dpm_event_impacts_interval_uq").on(t.eventId, t.eventVersion, t.orderId, t.criticalPathKey, t.startsAt, t.endsAt),
  check("dpm_event_impacts_duration_ck", sql`${t.endsAt} > ${t.startsAt} AND ${t.eventVersion} > 0 AND ${t.claimedMinutes} >= 0 AND ${t.admissibleMinutes} >= 0 AND ${t.admissibleMinutes} <= ${t.claimedMinutes}`),
  check("dpm_event_impacts_decision_ck", sql`${t.decision} IN ('PENDING','APPROVED','PARTIAL','REJECTED') AND (${t.decision} NOT IN ('PENDING','REJECTED') OR ${t.admissibleMinutes} = 0)`),
  check("dpm_event_impacts_validation_ck", sql`(${t.decision} = 'PENDING' AND ${t.validatedAt} IS NULL AND ${t.validatedById} IS NULL) OR (${t.decision} <> 'PENDING' AND ${t.validatedAt} IS NOT NULL AND ${t.validatedById} IS NOT NULL AND length(trim(${t.validatorComment})) > 0 AND (${t.decision} = 'REJECTED' OR ${t.proofDocumentId} IS NOT NULL))`)]);
export const dpmEventReviews = pgTable("dpm_event_reviews", {
  id: serial("id").primaryKey(), eventId: integer("event_id").notNull().references(() => dpmEvents.id, { onDelete: "restrict" }),
  eventVersion: integer("event_version").notNull(), step: text("step").notNull(), decision: text("decision").notNull(),
  comment: text("comment").notNull(), evidenceSnapshot: jsonb("evidence_snapshot").notNull(), ...dpmCreated(),
}, t => [uniqueIndex("dpm_event_reviews_step_uq").on(t.eventId, t.eventVersion, t.step),
  check("dpm_event_reviews_step_ck", sql`${t.step} IN ('DECLARATION','TECHNICAL','IMPACT','LOGISTICS','INDUSTRIAL') AND ${t.eventVersion} > 0`),
  check("dpm_event_reviews_decision_ck", sql`${t.decision} IN ('APPROVED','PARTIAL','REJECTED') AND length(trim(${t.comment})) > 0`)]);
export const dpmMilestones = pgTable("dpm_milestones", {
  id: serial("id").primaryKey(), orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  reference: text("reference").notNull(), kind: text("kind").notNull(), stepCode: text("step_code").notNull(),
  factoryId: integer("factory_id").notNull().references(() => factories.id, { onDelete: "restrict" }),
  destinationFactoryId: integer("destination_factory_id").references(() => factories.id, { onDelete: "restrict" }),
  calendarId: integer("calendar_id").notNull().references(() => dpmCalendars.id, { onDelete: "restrict" }),
  dueAt: timestamp("due_at", { withTimezone: true, mode: "string" }).notNull(), actualAt: timestamp("actual_at", { withTimezone: true, mode: "string" }),
  proofDocumentId: integer("proof_document_id").references(() => driveDocuments.id, { onDelete: "restrict" }), ...dpmCreated(),
}, t => [uniqueIndex("dpm_milestones_reference_uq").on(t.orderId, t.reference), index("dpm_milestones_due_idx").on(t.factoryId, t.dueAt),
  check("dpm_milestones_kind_ck", sql`${t.kind} IN ('TRANSFER','PROCESS') AND (${t.kind} <> 'TRANSFER' OR (${t.destinationFactoryId} IS NOT NULL AND ${t.destinationFactoryId} <> ${t.factoryId}))`)]);
export const dpmCorrectiveActions = pgTable("dpm_corrective_actions", {
  id: serial("id").primaryKey(), orderId: integer("order_id").references(() => orders.id, { onDelete: "restrict" }),
  eventId: integer("event_id").references(() => dpmEvents.id, { onDelete: "restrict" }),
  factoryId: integer("factory_id").notNull().references(() => factories.id, { onDelete: "restrict" }),
  category5m: text("category_5m").notNull(), rootCause: text("root_cause").notNull(), action: text("action").notNull(),
  ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }), dueDate: date("due_date").notNull(),
  status: text("status").notNull().default("OPEN"), effectiveness: text("effectiveness"),
  verifiedById: integer("verified_by_id").references(() => users.id, { onDelete: "restrict" }),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "string" }), ...dpmCreated(),
}, t => [index("dpm_corrective_actions_due_idx").on(t.factoryId, t.status, t.dueDate),
  check("dpm_corrective_actions_target_ck", sql`${t.orderId} IS NOT NULL OR ${t.eventId} IS NOT NULL`),
  check("dpm_corrective_actions_5m_ck", sql`${t.category5m} IN ('MANPOWER','METHODS','MACHINES','MATERIALS','ENVIRONMENT')`),
  check("dpm_corrective_actions_status_ck", sql`${t.status} IN ('OPEN','IN_PROGRESS','VERIFY','CLOSED') AND (${t.status} <> 'CLOSED' OR (${t.verifiedById} IS NOT NULL AND ${t.verifiedAt} IS NOT NULL AND length(trim(${t.effectiveness})) > 0))`)]);
export const dpmAuditRecords = pgTable("dpm_audit_records", {
  id: serial("id").primaryKey(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(),
  operation: text("operation").notNull(), reason: text("reason").notNull(), requestKey: uuid("request_key").notNull(),
  beforeData: jsonb("before_data"), afterData: jsonb("after_data"),
  capabilityUsed: text("capability_used").notNull(), factoryId: integer("factory_id").references(() => factories.id, { onDelete: "restrict" }),
  ...dpmCreated(),
}, t => [uniqueIndex("dpm_audit_records_request_uq").on(t.requestKey), index("dpm_audit_records_entity_idx").on(t.entityType, t.entityId, t.createdAt)]);


// Terminal decisions on immutable PENDING submissions; never rewrite the fact.
export const dpmCommitmentDecisions = pgTable("dpm_commitment_decisions", {
  id: serial("id").primaryKey(), commitmentId: integer("commitment_id").notNull().references(() => dpmCommitments.id, { onDelete: "restrict" }),
  factoryId: integer("factory_id").notNull().references(() => factories.id, { onDelete: "restrict" }),
  decision: text("decision").notNull(), reason: text("reason").notNull(),
  proofDocumentId: integer("proof_document_id").notNull().references(() => driveDocuments.id, { onDelete: "restrict" }),
  requestKey: uuid("request_key").notNull(), ...dpmCreated(),
}, t => [uniqueIndex("dpm_commitment_decisions_submission_uq").on(t.commitmentId), uniqueIndex("dpm_commitment_decisions_request_uq").on(t.requestKey),
  check("dpm_commitment_decisions_state_ck", sql`${t.decision} IN ('APPROVED','REJECTED') AND length(trim(${t.reason})) > 0`)]);
