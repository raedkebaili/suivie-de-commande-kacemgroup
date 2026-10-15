# 01 — Architecture (Phase 2)

## Forme générale

Une **SPA métier** logée dans l'App Router Next.js : deux pages
(`/` shell à onglets, `/login`), **73 route handlers** REST sous
`/api/*` (toutes `force-dynamic`, runtime Node), zéro **middleware**, zéro
**Server Action**. Les Server Components ne font que monter les providers ;
tout le rendu métier est côté client.

```
Navigateur (React 19)
  └─ page.tsx : shell à 17 onglets + recherche globale + notifications
       └─ 27 composants « View » — 1 par module
            └─ apiFetch() : fetch JSON + Authorization: Bearer <JWT>
Next.js /api/* (73 handlers)
  └─ auth par route (getUserFromHeaders + contrôle de rôle inline)
       └─ Drizzle ORM → pool pg (max 20) → PostgreSQL
Services externes
  └─ Google Drive (OAuth centralisé, scope drive.file) via src/lib/google-drive.ts
```

## Frontend

- **`src/app/layout.tsx`** : `<html lang="fr">`, métadonnées, 3 providers
  emboîtés : `AuthProvider` → `ColorProvider` → `ModificationsProvider`.
- **`src/app/page.tsx`** : coquille applicative — garde d'authentification
  (redirection `/login`), **17 onglets filtrés par rôle** (constante `TABS`),
  recherche globale avec debounce 300 ms, notifications (polling 30 s),
  thème sombre, **planificateur de sauvegarde** (superadmin), pont
  **Electron** (`onShortcut` F2/F6…), ouverture de modales par `CustomEvent`.
- **`src/app/login/page.tsx`** : formulaire — appelle `POST /api/auth/login`,
  stocke le JWT. *Affiche « admin / mot de passe initial configuré hors dépôt » en clair (voir 05).*

### Onglets et rôles

| Onglet | Composant | Rôles |
|---|---|---|
| Tableau de bord | `DashboardView` | tous |
| Commandes | `OrdersView` | tous |
| Archive commandes | `ArchiveView` | tous |
| Production | `ProductionView` | superadmin, planification |
| Expédition | `ExpeditionView` | superadmin, planification |
| Planning production | `PlanningProductionView` | superadmin, planification |
| Usines | `FactoriesView` | superadmin, planification |
| Matières | `MatiereView` | superadmin, technique |
| Télégestion | `TelegestionView` | superadmin, technique |
| Agences | `AgenciesView` | superadmin, commercial |
| Clients | `ClientsView` | superadmin, commercial, recouvrement |
| Recouvrement | `RecouvrementView` | superadmin, recouvrement |
| Stockage | `StorageView` | tous |
| Utilisateurs | `UsersView` | superadmin |
| Watchdog (journal) | `WatchdogView` | superadmin |
| Sauvegarde | `BackupView` | superadmin |
| Couleurs | `ColorsView` | superadmin |

Composants transverses : `Sidebar`, `DocumentsPanel` (documents contextuels),
`OrderItemRow`, `ModifiedCell`, `RecouvrementAlertCell`, `AutocompleteInput`,
`MaterialAutocomplete`, `CategoryMaterialSelect`, `ArticleGroupingView`,
`GoogleDriveGuide`.

### Contextes / hooks

- **`auth-context`** : session JWT (vérification `/api/auth/me` au montage,
  `login`/`logout`). Token en `localStorage` (`otp_token`).
- **`color-context`** : charge `app_colors`, expose `colorFor(key)` à toute
  l'UI (statuts, priorités, modules) — persistance en base des préférences.
- **`modifications-context`** : charge les `modification_logs` par commande
  pour surligner les cellules modifiées (`ModifiedCell`).

## Backend

- **Pas de couche service** : la logique vit dans les handlers + `src/lib`.
- **Auth par route** : helper local `auth(req, roles)` dupliqué (~40
  déclinaisons) ; `getUserFromHeaders` lit `Authorization: Bearer`.
- **`api-helpers.checkAuth`** existe mais est peu utilisé (duplication —
  dette documentée 07).
- **Journalisation** : `logActivity` (table `activity_logs`),
  `logModification` (table `modification_logs`), `notifyUser` /
  `notifyRole` (table `notifications`) — appelés depuis les routes.

## Modules métier (`src/lib`)

| Famille | Fichiers | Rôle |
|---|---|---|
| Numérotation | `order-number.ts` | `N/AAAA` thread-safe (`order_counters` + `FOR UPDATE`), preview, rattrapage historique |
| Production | `production-apply.ts` | **source unique de vérité** « appliquer une quantité produite » (lot, cumul, LIVREE, promotion priorités) |
| Priorités | `priority.ts`, `priority-promotion.ts` | file P1…P10 + « Normale », rétrocompat URGENTE/TRES_URGENTE ; remontée automatique des rangs quand une commande est entièrement produite |
| Planning | `production-planning.ts`, `production-planning-constants.ts` | 5 états (EN_ATTENTE → TERMINE), clignotement conditionné à la date, couleurs seedées |
| Archive | `archive.ts`, `archive-constants.ts` | états d'archive, détection de colonnes (« État », « Reste à livrer », Clients, Affaire), règle cellule vide ≠ 0 |
| Recouvrement | `recouvrement.ts`, `recouvrement-constants.ts` | 13 tons de couleurs, 17 états par défaut, seed idempotent |
| Stockage | `google-drive.ts`, `crypto.ts` | client Drive central, dossiers contextuels, AES-256-GCM |
| Documents | `document-categories.ts` | 8 catégories, extensions autorisées, 50 Mo max |
| Sauvegarde | `backup-data.ts`, `backup-scheduler.ts` | collecte FK-safe de 29 tables ; planificateur **navigateur** (File System Access + IndexedDB) |
| Référentiels | `material-categories.ts`, `tech-categories.ts` | seeds de catégories de matières / bibliothèque technique |
| Présentation | `color-utils.ts`, `color-context.tsx`, `order-visual-state.ts` | couleurs par défaut, état visuel d'une ligne de commande |
| Groupement | `article-grouping.ts` | regroupement par 4 premiers caractères normalisés (export Excel + affichage identiques) |
| Infra | `db-error.ts`, `api.ts`, `api-helpers.ts`, `types.ts`, `excel.ts` | messages BD conviviaux, client fetch, types, export |

## Tâches automatiques

1. **Seeds paresseux idempotents** : `/api/health` et les GET concernés
   réinsèrent les clés manquantes sans jamais écraser (admin, couleurs,
   catégories de matières, états de recouvrement, archive, planning).
2. **Sauvegarde automatique** : `backup-scheduler.ts` (côté navigateur
   superadmin) — vérifie chaque minute l'heure planifiée
   (`system_settings.backup_*`), appelle `POST /api/backup/auto`, écrit le
   JSON dans un dossier local via File System Access API (fallback
   téléchargement). **Aucun cron serveur.**
3. **Rafraîchissement du refresh token Google** : événement `tokens` du
   client OAuth → re-chiffrement et persistance automatiques.
