# 02 — Base de données (Phase 3)

- **SGBD** : PostgreSQL (15 → 17+ supporté par les scripts Windows).
- **ORM** : Drizzle ORM 0.45.2 sur pool `pg` (paresseux, max 20 connexions,
  SSL heuristique Neon/Supabase).
- **Migrations** : **aucune** — schéma appliqué par `drizzle-kit push`.
- **Fonctions / vues / triggers** : **aucun**. Toute la logique est applicative.
- **32 tables**, PK `serial id` partout, timestamps `mode: "string"`.

## Groupes fonctionnels

### Socle (référentiels & sécurité)
`users` (login, rôle, `dark_mode`) — `agencies` (code unique) — `clients`
(code unique) — `factories` (usines, `responsable_id → users` RESTRICT).

### Cœur commande
`orders` (n° unique `order_number`, **deux pistes d'état** : `status`
commercial SUR_STOCK/BON_COMMANDE/PREVISION et `production_status`
EN_INSTANCE/EN_PRODUCTION/AWAITING_DELIVERY/LIVREE/ANNULEE ; verrouillage
`locked_by/at`, motifs d'annulation, `tech_completed`, `planif_completed`)
→ `order_items` (FK cascade ; 7 familles de champs techniques avec triple
traçabilité `xxxBy/xxxAt` ; cumuls `produced_qty`, `delivered_qty` ;
`is_telegestion`, `production_unit`, `planned_loading_date`, `unit_price`)
→ `production_batches` / `expedition_batches` (lots avec
`cumulative_total` figé et `produced_by` / `delivered_by`).

### Technique
`material_categories` (clé unique, `is_telegestion`, tri) — `matieres`
(référence + libellé + stock, FK catégorie RESTRICT, archivage `active`)
— `item_technical_components` (association article ↔ matière avec copies
historique + `enteredBy`, cascade sur article/commande, SET NULL sur
matière/catégorie) — `tech_library` / `article_library` /
`production_unit_lib` (autocomplétions à compteur d'usage).

### Études photométriques
`photometric_studies` (liée à une commande — cascade — **ou** affaire libre
avec `order_id NULL`) → `photometric_study_items` (cascade ; copie
référence/libellé de la lentille `→ matieres` SET NULL).

### Planification
`production_plan_entries` : **copies dénormalisées** (`article_name`,
`order_number`, `client_name`, `factory_name`) pour l'historique,
`planned_qty`, `status` (5 états), `reason`, garde d'**idempotence**
`applied_qty`/`applied_at`.

### Traçabilité & notifications
`activity_logs` (journal global) — `modification_logs`
(ordre/champ/ancienne/nouvelle valeur) — `notifications`
(utilisateur, type, titre, message, liées à une commande, `read`).

### Numérotation & configuration
`order_counters` (compteur par année, `UNIQUE(year)` — verrou `FOR UPDATE`)
— `app_colors` (toutes les couleurs pilotables par catégorie : commercial,
production, visual, priority, tracking, etude, technique, recouvrement,
archive, planning) — `system_settings` (clé/valeur : sauvegarde, colonnes
masquées, etc.).

### Sauvegarde
`backup_history` (métadonnées + **contenu JSON complet** dans
`backup_data` — croissance à surveiller).

### Recouvrement
`recouvrement_states` (catalogue, `color_key → app_colors`) —
`client_recouvrement_states` (**1 état courant par client**, `UNIQUE(client_id)`,
FK cascade/restrict) — `client_recouvrement_logs` (historique).

### Stockage & documents
`storage_config` (**ligne unique** : OAuth chiffré AES-256-GCM, dossier
racine, statut) — `drive_documents` (association logique fichier Drive ↔
commande XOR étude ; contraintes UNIQUE `(order_id, drive_file_id)` et
`(study_id, drive_file_id)` + index par entité).

### Archive Excel
`archive_sheets` (nom, fichier source, **colonnes + préambule JSON**) →
`archive_rows` (cellules JSON, `state_detected`, `state_override`) →
`archive_cell_colors` (**UNIQUE(row_id, column_index)**).

## Schéma relationnel (extraits)

```
users 1───< orders >───1 clients          factories 1───< production_plan_entries
agencies 1──< orders 1───< order_items 1───< production_batches
                    │         │           └─< expedition_batches
                    │         ├─< item_technical_components >─── matieres >─── material_categories
                    │         └─< production_plan_entries >─── factories
                    ├─< modification_logs   ├─< notifications
                    ├─< photometric_studies 1───< photometric_study_items >─── matieres
                    └─< drive_documents (XOR study_id)
clients 1───1 client_recouvrement_states >─── recouvrement_states
clients 1───< client_recouvrement_logs
archive_sheets 1───< archive_rows 1───< archive_cell_colors
orders 1───< modification_logs ; users 1───< activity_logs
```

## Contraintes notables

- **Unicités** : `users.username`, `agencies.code/name`, `clients.code/name`,
  `orders.order_number`, `order_counters.year`, bibliothèques
  (`name`), `material_categories.key/name`, `recouvrement_states.key`,
  `app_colors.key`, `system_settings.key`, `factories.code/name`,
  `client_recouvrement_states.client_id`.
- **Suppressions** : cascade (articles, lots, études, archive, documents,
  recouvrement client) ; RESTRICT (matière ↔ catégorie, état de recouvrement
  utilisé, responsable d'usine) ; SET NULL (matière/catégorie dans un
  composant, acteurs référencés).
- **Index explicites** : uniquement sur `drive_documents` (2 uniques +
  2 de recherche) et `archive_cell_colors(row,column)`. **Aucun index sur
  les FK massives** (`order_items.order_id`, `*_batches.item_id`, …) —
  voir 06.
- **Règles en base** : valeur par défaut de `orders.order_date` calculée en
  SQL (`to_char(now(),'YYYY-MM-DD')`) ; états par défaut (`PREVISION`,
  `EN_INSTANCE`, `NORMALE`, `disconnected`…).
