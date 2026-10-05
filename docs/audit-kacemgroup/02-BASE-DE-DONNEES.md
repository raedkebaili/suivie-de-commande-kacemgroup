# Phase 3 — Audit de la base de données

## 3.1 Généralités

| Élément | Valeur |
|---|---|
| SGBD | **PostgreSQL** (local 15–17, ou Neon/Supabase/Railway avec SSL auto-détecté) |
| ORM | **Drizzle ORM 0.45.2** (`drizzle-orm/node-postgres`), driver `pg` Pool |
| Connexion | `src/db/index.ts` : **lazy** via Proxy sur `globalThis` (build OK sans DB), `max = DB_POOL_MAX ‖ 20`, `idleTimeoutMillis 30 s`, `connectionTimeoutMillis 10 s` |
| Migrations | ❌ **aucune migration versionnée** (pas de dossier `drizzle/`) : le schéma est appliqué par `drizzle-kit push` (schema-first) |
| Tables | **31** (définies dans `src/db/schema.ts`, 451 lignes) |
| Vues / triggers / fonctions | **aucun** — toute la logique métier vit dans le code applicatif |
| Conventions | `id serial PK` partout ; timestamps `timestamp mode:"string" defaultNow()` ; dates métier en colonnes **texte** (`YYYY-MM-DD`) ; énumérations = colonnes **texte** sans CHECK (statuts, rôles, priorités) |

## 3.2 Diagramme relationnel (simplifié)

```
users ──< orders ──< order_items ──< production_batches
  │         │  │         │   └──────< expedition_batches
  │         │  │         ├──────────< item_technical_components >── matieres >── material_categories
  │         │  │         └──────────< production_plan_entries >── factories
  │         │  └──< notifications
  │         ├──< modification_logs
  │         ├── clients >── client_recouvrement_states >── recouvrement_states
  │         │      └─────< client_recouvrement_logs
  │         ├── agencies
  │         └──< photometric_studies ──< photometric_study_items (>── matieres)
  ├──< activity_logs
  └──  (référencé par traçabilité : app_colors.updatedById, backup_history.createdById…)

order_counters (année → dernier n°)      — table de comptage, aucune FK
app_colors / system_settings             — paramétrage dynamique
backup_history                           — sauvegardes JSON intégrales
storage_config (1 ligne)                 — OAuth Google Drive, secrets chiffrés
production_unit_lib / article_library / tech_library — bibliothèques d'autocomplétion
archive_sheets ──< archive_rows ──< archive_cell_colors  — module STRICTEMENT isolé (aucune FK vers orders)
```

## 3.3 Description des tables (rôle, clés, règles)

### Cœur commandes

**`users`** — comptes applicatifs. `username unique`, `password_hash` (bcrypt 10),
`role` texte défaut `commercial`, `active`, `dark_mode`. Aucune contrainte sur le
domaine du rôle (texte libre).

**`agencies`** / **`clients`** — référentiels (`name`, `code` uniques). Référencés
par `orders` (FK sans `onDelete` → suppression bloquée tant que des commandes
existent ; la route DELETE supprime d'abord les dépendances manuellement).

**`orders`** — commande client.
- `order_number unique` format `N/AAAA` (ex. `125/2026`), généré par compteur transactionnel.
- Deux statuts orthogonaux : `status` **commercial** (`PREVISION` ‖ `BON_COMMANDE` ‖ `SUR_STOCK`)
  et `production_status` (`EN_INSTANCE`, `EN_PRODUCTION`… `ANNULEE`, `LIVREE`).
- `priority` : `P1…P10` ou `NORMALE` (historique `URGENTE`… lisible).
- Verrou d'édition optimiste applicatif : `locked_by/locked_at` (5 minutes, voir `03-API.md`).
- Annulation : `cancel_reason/cancelled_by/cancelled_at`.
- Flags d'avancement inter-services : `tech_completed`, `planif_completed`.
- Traçabilité : `created_by → users`, `created_by_name`, `updated_by`.

**`order_items`** — lignes d'articles. FK `order_id → orders ON DELETE CASCADE`.
`article_name`, `quantity ≥ 1`, `note`, `client_spec`, `is_telegestion` (drapeau
famille saisi par le commercial), `production_unit` (texte recopié depuis
`factories.name` à la planification — volontairement non-FK, cf. commentaire
schéma), `planned_loading_date`. **Specs techniques** en 7 couples de colonnes
(`pcb`, `color_temperature`, `lens`, `driver`, `electrical_class`, `accessories`,
`other_tech_specs`), chacun avec traçabilité `*_by` / `*_at`. Cumuls
`produced_qty` / `delivered_qty` (mis à jour par les lots), `unit_price`, `description`.

**`production_batches`** — lots de production : `item_id → order_items`,
`order_id → orders` (FK sans cascade — supprimés manuellement), `quantity`,
`cumulative_total`, `produced_by`, `production_date` (texte).

**`expedition_batches`** — lots d'expédition : idem + `driver_name`,
`planned_loading_date`, `delivered_by`, `note`.

### Production avancée

**`factories`** — usines : `code`, `name` uniques, `responsable_id → users
ON DELETE RESTRICT` (un responsable ne peut pas être supprimé tant qu'il est
affecté), `active`.

**`production_plan_entries`** — planning journalier par usine.
`plan_date` (texte), `factory_id → factories ON DELETE SET NULL`,
`item_id`/`order_id` CASCADE, copies d'historique (`article_name`,
`order_number`, `client_name`), `planned_qty`, statut
`EN_ATTENTE ‖ EN_COURS ‖ SUSPENDU ‖ ANNULE ‖ TERMINE` + `reason`,
**garde d'idempotence** `applied_qty` / `applied_at` (la quantité n'est versée
à la production qu'une fois au passage `TERMINE`). **N'altère jamais
directement `order_items`** (commentaire schéma).

### Catalogue technique

**`material_categories`** — familles de matières (`key`, `name` uniques,
`is_telegestion`, `sort_order`).
**`matieres`** — matières premières : `category_id ON DELETE RESTRICT`,
`reference` défaut `SANS-REF`, `stock` (double), `specs`, `active`.
Sans `(category_id, reference)` unique — doublons possibles en base.
**`item_technical_components`** — composants choisis pour un article : FK
`item_id`/`order_id` CASCADE, `category_id`/`material_id`/`entered_by_id`
**SET NULL** (préserve l'historique après suppression du référentiel), copies
(`category_key/name`, `material_reference/label`), traçabilité par composant
(`entered_by_id/name/at`). La mise à jour est **différentielle** (comparaison
d'ensembles d'IDs) pour ne jamais réécrire la traçabilité des composants inchangés.

### Traçabilité & notifications

**`activity_logs`** — journal global (`user_id`, `username`, `action`, `details`).
**`modification_logs`** — diff par commande (`order_id`, `field`, `old_value`,
`new_value`, auteur). Alimenté par la modification commerciale, la technique
différentielle et la promotion de priorités.
**`notifications`** — notification par utilisateur (`type`, `title`, `message`,
`order_id`, `read`).

### Numérotation & paramétrage

**`order_counters`** — 1 ligne par année (`year unique`, `last_number`),
verrouillée `FOR UPDATE` lors de la génération.
**`app_colors`** — couleurs dynamiques par `key unique` + `category`
(commercial, production, visual, priority, recouvrement, archive, planning…),
éditables dans l'onglet Couleurs, traçées.
**`system_settings`** — clé-valeur (`backup_time`, `backup_max_count`,
`backup_last_run`, `backup_last_status`, visibilité colonnes…), traçées.
**`backup_history`** — historique des sauvegardes ; `backup_data` contient le
**JSON intégral** (taille DB à surveiller) ; rotation par `backup_max_count`.

### Études photométriques

**`photometric_studies`** — étude liée à une commande (`order_id CASCADE`) **ou**
indépendante (`order_id NULL` + `affaire_name`) ; `study_number` manuel ;
`client_id SET NULL`.
**`photometric_study_items`** — N articles par étude (`study_id CASCADE`),
lentille choisie dans `matieres` (`lens_id SET NULL` + copies référence/libellé).

### Recouvrement

**`recouvrement_states`** — catalogue d'états (`key unique`, `label`,
`color_key → app_colors` [lien logique, pas une FK], tri, actif).
**`client_recouvrement_states`** — **1 état courant par client**
(`client_id unique ON DELETE CASCADE`, `state_id ON DELETE RESTRICT` — un état
utilisé ne peut pas être supprimé).
**`client_recouvrement_logs`** — historique des changements (copie du libellé).

### Stockage Google Drive

**`storage_config`** — **une seule ligne** (config centralisée) : `client_id`,
`encrypted_client_secret`, `encrypted_refresh_token` (**AES-256-GCM**, jamais
renvoyés au frontend), `google_account_email`, `root_folder_id` (dossier
« ORDERTRACK STORAGE »), `status` (`disconnected ‖ connected ‖ expired`).
Le champ `last_error` sert aussi de **sas temporaire** pour le `state` OAuth
(préfixe `oauth_state:`).

### Archive (module indépendant)

**`archive_sheets`** — feuille Excel importée = une période. `name unique`,
`columns`/`preamble` sérialisés JSON avec **ordre préservé**, index détectés des
colonnes « Reste à livrer », « Clients », « Affaire », « État ».
**`archive_rows`** — ligne brute (`cells` JSON aligné sur `columns`),
`state_detected` (lu dans le fichier), `state_override` (manuel, prioritaire ;
`NULL` → règle « Reste = 0 ⇒ LIVRÉ », une cellule vide n'étant jamais 0).
**`archive_cell_colors`** — couleur d'**une** cellule : `uniqueIndex`
`(row_id, column_index)` — **seul index composite explicite du schéma** ;
CASCADE en chaîne depuis `archive_sheets`.

### Autocomplétion

**`production_unit_lib`**, **`article_library`**, **`tech_library`**
(`category + value`, `usage_count`) : suggestions à la saisie, incrémentées à
l'usage.

## 3.4 Contraintes, index, intégrité — constats

1. **Clés primaires** : `serial` partout. **Clés étrangères** : 25 relations,
   politiques `CASCADE` (données filles), `RESTRICT` (référentiels en usage),
   `SET NULL` (historique à préserver). Cohorté et cohérent.
2. **Unicités** : usernames, codes, noms de référentiels, `order_number`,
   `order_counters.year`, `client_recouvrement_states.client_id`, `app_colors.key`,
   `system_settings.key`, `archive_sheets.name`, `(row_id, column_index)`.
3. ⚠️ **Aucun index secondaire** sur les FK de fort trafic
   (`order_items.order_id`, `*_batches.item_id/order_id`, `notifications.user_id`,
   `modification_logs.order_id`, `production_plan_entries.plan_date/factory_id`,
   `archive_rows.sheet_id`). Voir `06-PERFORMANCES.md`.
4. ⚠️ **Pas de CHECK** sur statuts/rôles/priorités (texte libre) : le domaine
   n'est garanti que par le code applicatif.
5. ⚠️ Dates métier en **texte** (`order_date`, `production_date`…) : tri fiable
   au format ISO, mais aucune validation en base.
6. Règles métier en base : **aucune** (pas de trigger/vue/fonction) — tout est
   applicatif (numérotation, transitions, cumuls).

## 3.5 Amorçage (seeds)

Seeds idempotents déclenchés par `GET /api/health` et `login/me` :
utilisateur `admin` si absent, catégories de matières par défaut, états de
recouvrement, couleurs archive/planning (pattern « insert si clé absente,
jamais d'écrasement »).
