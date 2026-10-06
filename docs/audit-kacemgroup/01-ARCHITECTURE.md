# Phase 2 — Architecture applicative

## 2.1 Vue d'ensemble

Application **monolithique Next.js (App Router)** : interface React (client) +
API REST co-localisées sous `src/app`. Communication exclusive **navigateur →
API JSON** via un client `fetch` maison (pas de Server Actions, pas de
Server Components métiers, pas de middleware).

```
src/
├── app/
│   ├── layout.tsx          # Providers globaux (Auth, Couleurs, Modifications)
│   ├── page.tsx            # SPA interne : 17 onglets rendus conditionnellement
│   ├── login/page.tsx      # Page de connexion
│   ├── globals.css         # Tailwind v4
│   └── api/                # 71 fichiers route.ts (~110 handlers HTTP)
├── components/             # 27 composants (1 par module + utilitaires)
├── lib/                    # 24 modules partagés (métier, auth, clients…)
├── db/                     # Connexion + schéma Drizzle (31 tables)
└── types/                  # Déclarations Electron + modules
```

## 2.2 Frontend

### Pages et routage
- `/login` (`src/app/login/page.tsx`) : formulaire de connexion ; redirige vers `/` si déjà connecté. ⚠️ Affiche `admin / admin123` en clair.
- `/` (`src/app/page.tsx`, 297 lignes) : **une seule page qui orchestre 17 onglets** via état local `activeTab` ; chaque onglet = un composant `*View`. Filtrage des onglets selon `user.role` (table `TABS`). Gestion des raccourcis Electron (`window.electronAPI?.onShortcut`).

### Onglets (module → composant → rôles UI)
| Onglet | Composant | Rôles (côté UI) |
|---|---|---|
| Tableau de bord | `DashboardView` (recharts) | tous |
| Commandes | `OrdersView` (992 l., le plus gros) | tous |
| Archive commandes | `ArchiveView` (511 l.) | tous |
| Production | `ProductionView` | superadmin, planification |
| Expédition | `ExpeditionView` | superadmin, planification |
| Planning production | `PlanningProductionView` (505 l.) | superadmin, planification |
| Usines | `FactoriesView` | superadmin, planification |
| Matières | `MatiereView` (363 l.) | superadmin, technique |
| Télègestion | `TelegestionView` | superadmin, technique |
| Agences | `AgenciesView` | superadmin, commercial |
| Clients | `ClientsView` | superadmin, commercial, recouvrement |
| Recouvrement | `RecouvrementView` | superadmin, recouvrement |
| Stockage (Google Drive) | `StorageView` (544 l.) + `GoogleDriveGuide` | tous |
| Utilisateurs | `UsersView` | superadmin |
| Watchdog (journal d'activité) | `WatchdogView` | superadmin |
| Sauvegarde | `BackupView` (640 l.) | superadmin |
| Couleurs | `ColorsView` (385 l.) | superadmin |

Composants transverses : `Sidebar` (navigation, dark mode), `AutocompleteInput`,
`MaterialAutocomplete`, `CategoryMaterialSelect` (sélection hiérarchique
catégorie/matière), `OrderItemRow`, `ModifiedCell`, `RecouvrementAlertCell`,
`ArticleGroupingView`.

### Gestion d'état côté client
- **Pas de store global** (pas de Redux/Zustand) : état local par composant + 3 providers React Context :
  - `AuthProvider` (`src/lib/auth-context.tsx`) : utilisateur courant, login/logout, vérification `/api/auth/me` au montage (token depuis `localStorage`).
  - `ColorProvider` (`src/lib/color-context.tsx`) : couleurs dynamiques depuis `/api/colors`.
  - `ModificationsProvider` (`src/lib/modifications-context.tsx`) : logs de modifications (badge/signalisation des cellules modifiées).
- Client HTTP unique `apiFetch` (`src/lib/api.ts`) : injecte `Authorization: Bearer <token localStorage>`, parse JSON, supprime le token sur 401.

## 2.3 Backend / API

71 fichiers `route.ts` sous `src/app/api` (détail complet : `03-API.md`).
Particularités structurelles :

- **Pas de middleware Next.js** : chaque route authentifie elle-même via
  `getUserFromHeaders(request)` (Bearer JWT). Une fonction `auth(r, roles?)`
  est **dupliquée dans ~20 routes** ; un helper mutualisé existe
  (`src/lib/api-helpers.ts`) mais est **inutilisé** — dette identifiée.
- Toutes les routes principales portent `export const dynamic = "force-dynamic"`
  (jamais de cache — cohérent pour une application métier temps réel en interne).
- Réponses d'erreur normalisées : `{ error: string }` + statut HTTP ;
  `friendlyDbErrorMessage` traduit les erreurs PostgreSQL (ex. 42P01 « tables
  non créées ») en messages exploitables.

## 2.4 Modules `src/lib` (rôle de chacun)

| Module | Rôle |
|---|---|
| `auth.ts` | JWT (jose, HS256, 24 h), bcrypt, `getUserFromHeaders`, `logActivity`, `logModification`, `notifyUser/notifyRole`, `seedDefaultUser` (admin par défaut) |
| `crypto.ts` | AES-256-GCM des secrets Drive (clé `APP_ENCRYPTION_KEY`, repli dérivé de `JWT_SECRET`) |
| `api.ts` / `api-helpers.ts` | client fetch navigateur / helper `checkAuth` serveur (**inutilisé**) |
| `auth-context.tsx`, `color-context.tsx`, `modifications-context.tsx` | providers React |
| `order-number.ts` | numérotation `N/AAAA` **thread-safe** (transaction + `SELECT … FOR UPDATE` sur `order_counters`) |
| `priority.ts` / `priority-promotion.ts` | file de priorités P1…P10 + NORMALE, rétrocompatibilité URGENTE… ; promotion automatique à la fin de production |
| `production-apply.ts` | **source unique de vérité** : appliquer une quantité produite (lot, cumul, passage `LIVREE`, log, promotion) — partagée entre l'onglet Production et le Planning |
| `production-planning.ts` + `production-planning-constants.ts` | seed couleurs planning, libellés de statuts, `canManage` |
| `order-visual-state.ts` | état visuel d'une commande (neutre / en attente de livraison / livrée / annulée) + classes CSS |
| `article-grouping.ts` | regroupement d'articles par 4 premiers caractères significatifs |
| `material-categories.ts`, `tech-categories.ts` | seed et constantes des familles de matières |
| `recouvrement.ts` + `recouvrement-constants.ts` | seed des états de recouvrement (pattern seed idempotent « insert si absent ») |
| `archive.ts` + `archive-constants.ts` | seed des couleurs d'archive |
| `google-drive.ts` | service serveur Drive : OAuth2 offline, dossier racine unique, jamais de secret côté client |
| `excel.ts` | génération du classeur Excel d'export des commandes |
| `backup-data.ts` | collecte des tables pour la sauvegarde JSON (partagée manuel/auto) |
| `backup-scheduler.ts` | **planificateur côté navigateur** : intervalle 1 min, File System Access API + handle en IndexedDB, repli téléchargement |
| `db-error.ts` | traduction des codes d'erreur PostgreSQL |
| `color-utils.ts`, `types.ts` | utilitaires couleurs / types partagés (`User`, `ROLE_LABELS`…), |

## 2.5 Authentification / autorisations

- **Authentification** : `POST /api/auth/login` → JWT (payload `{id, username, role, fullName, darkMode}`, HS256, expiration 24 h) renvoyé en JSON, stocké en `localStorage` (`otp_token`), envoyé en `Authorization: Bearer`.
- **Session** : stateless ; **pas de cookie**, pas de révocation côté serveur ; `logout` ne fait que journaliser (le token reste valide jusqu'à expiration).
- **Rôles** (texte libre en base, `users.role`) : `superadmin`, `commercial`, `technique`, `planification`, `consultant_prod`, `recouvrement` (`ROLE_LABELS`, `src/lib/types.ts`).
- **Contrôle d'accès** : appliqué par route (voir `03-API.md`) *et* par l'UI (onglets filtrés). Le contrôle serveur est la protection réelle ; l'UI n'est que cosmétique.

## 2.6 Upload de fichiers

| Canal | Destination | Limites |
|---|---|---|
| `POST /api/storage/upload` (FormData) | Google Drive centralisé | 50 Mo/fichier, non vide, utilisateur authentifié |
| `POST /api/import` (FormData xlsx) | tables clients/agences | superadmin/commercial, `xlsx` parsé côté serveur |
| `POST /api/archive/import` (FormData xlsx) | tables archive_* | superadmin |
| `POST /api/backup` (JSON) | restauration complète | superadmin |

## 2.7 Tâches automatiques

1. **Sauvegarde automatique pilotée par le navigateur** (`backup-scheduler.ts`, onglet ouvert côté admin) : vérifie chaque minute l'heure configurée (`system_settings.backup_time`), appelle `/api/backup/auto`, écrit le JSON dans un dossier local via File System Access.
2. **Sauvegarde par cron externe** : `POST /api/backup/auto` accepté sans session si en-tête `x-backup-secret` = `BACKUP_SECRET`.
3. **Seeds paresseux au healthcheck** : `GET /api/health` exécute `seedDefaultUser`, `ensureDefaultMaterialCategories`, `ensureRecouvrementDefaults`, `ensureArchiveColors`, `ensurePlanningColors` (idempotents) — le healthcheck a donc des **effets de bord** assumés (amorçage de la base).

## 2.8 Scripts internes hors app

`setup.bat` (installation Windows en un clic) et `start-ordertrack.bat`
(démarrage, génération de `JWT_SECRET`, healthcheck). Pas de scripts Node
dédiés (pas de dossier `scripts/`).
