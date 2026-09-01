# AUDIT DE REPRISE — OrderTrack Pro / « Gestionnaire des Commandes » Kacem Group

> **Nature du document** : audit de reprise produit après clonage fidèle du dépôt
> `github.com/raedkebaili/suivie-de-commande-kacemgroup` et exécution complète
> (build + démarrage + tests d'API) dans un environnement de recette.
> Aucune ligne de code métier n'a été modifiée. Le dépôt reste la source de vérité.
>
> Complète (sans les remplacer) les documents existants du dépôt :
> `AUDIT_COMPLET.md`, `INSTALL-GUIDE.md`, `DEPLOYMENT.md`.

---

## PHASE 1 — CARTOGRAPHIE GLOBALE DU PROJET

### 1.1 Identité technique

| Élément | Valeur constatée | Preuve |
|---|---|---|
| Framework | **Next.js 16.2.6** (App Router) | `package.json` |
| UI | **React 19.2.6**, **Tailwind CSS 4.1.17** (PostCSS) | `package.json`, `postcss.config.mjs` |
| Langage | **TypeScript 5.9.3 strict** | `tsconfig.json` (`strict: true`) |
| Runtime | Node.js (aucune contrainte `engines` déclarée — version non épinglée) | `package.json` |
| Gestionnaire de paquets | **npm** (`package-lock.json` présent, pas de pnpm/yarn lock) | racine |
| Base de données | **PostgreSQL** via driver `pg` 8.20.0 (pool max 20) | `src/db/index.ts` |
| ORM | **Drizzle ORM 0.45.2** + `drizzle-kit` 0.31.10 (stratégie `push`, **pas de dossier de migrations**) | `drizzle.config.ts` |
| Auth | JWT **HS256** via `jose` 6.x + hash **bcryptjs** 3.x (coût 10) | `src/lib/auth.ts` |
| Excel | `xlsx` 0.18.5 (import clients/agences, export commandes) | `src/app/api/import/route.ts` |
| Graphiques | `recharts` 3.x (tableau de bord) | `DashboardView.tsx` |
| Scripts npm | `dev`, `build`, `start`, `lint`, `typecheck` | `package.json` |
| Déploiement | Scripts Windows `setup.bat` / `start-ordertrack.bat` (hébergement LAN, écoute 0.0.0.0) + types Electron (`src/types/electron.d.ts`, shell desktop externe au dépôt) | racine, `next.config.ts` |

### 1.2 Variables d'environnement

| Variable | Rôle | Obligatoire |
|---|---|---|
| `DATABASE_URL` | Chaîne PostgreSQL (détection SSL Neon/Supabase automatique) | Oui (runtime API) |
| `JWT_SECRET` | Secret de signature HS256. **Fallback codé en dur** dans `src/lib/auth.ts` si absent | Fortement recommandé |
| `NEXT_PUBLIC_APP_URL` | URL publique (liens absolus) | Non |
| `DB_POOL_MAX` | Taille du pool pg (défaut 20) | Non |
| `NEXT_ALLOWED_DEV_ORIGINS` | Origines HMR dev additionnelles | Non |

### 1.3 Arborescence logique

```
src/
├─ app/
│  ├─ layout.tsx            Racine HTML + 3 providers (Auth, Color, Modifications)
│  ├─ page.tsx              SPA principale (shell à onglets, recherche globale, notifications)
│  ├─ login/page.tsx        Écran de connexion
│  └─ api/ … 40 route handlers (Node runtime, toutes force-dynamic)
├─ components/              19 composants "View" + utilitaires de tableau
├─ db/                      schema.ts (22 tables) + index.ts (pool paresseux via Proxy)
├─ lib/                     auth, contexts, helpers API, backup-scheduler, excel, libs métier
└─ types/                   electron.d.ts, modules.d.ts (File System Access API)
```

---

## PHASE 2 — ARCHITECTURE APPLICATIVE

**Pattern général : monolithe Next.js « SPA dans l'App Router ».**
Le rendu serveur (SSR/RSC) n'est volontairement pas utilisé côté pages : deux pages client
(`"use client"`) pilotent tout, l'App Router sert de conteneur d'**API REST** (40 endpoints,
tous `export const dynamic = "force-dynamic"`).

| Couche | Rôle précis |
|---|---|
| `AuthProvider` | Vérifie le token au montage via `/api/auth/me` ; expose `login/logout` |
| `ColorProvider` | Charge les couleurs personnalisables (`app_colors`) et génère le CSS dynamique |
| `ModificationsProvider` | Alimente les badges « cellule modifiée » à partir de `modification_logs` |
| `Sidebar` + onglets | 11 vues filtrées par rôle (dashboard, orders, production, expedition, matieres, agencies, clients, users, watchdog, backup, colors) |
| API REST | Chaque route re-vérifie le JWT **et** le rôle (pas de middleware global : sécurité par route, fonction `auth()` locale ou `checkAuth` de `api-helpers.ts`) |
| `src/lib/auth.ts` | Cœur transverse : hash, JWT, `logActivity`, `logModification`, `notifyUser/notifyRole`, seed admin |
| Raccourcis | Événements DOM `shortcut:*` + `window.electronAPI` (shell Electron externe, optionnel) |

**Point d'attention d'architecture** : l'autorisation NE repose PAS sur `middleware.ts`
(inexistant). Chaque route implémente son propre contrôle — pattern cohérent partout dans le
code, mais toute nouvelle route DOIT répliquer ce garde-fou (risque d'oubli).

---

## PHASE 3 — AUDIT DE LA BASE DE DONNÉES

- **SGBD** : PostgreSQL. **ORM** : Drizzle. **Migrations** : aucune (push direct du schéma).
- **22 tables**, toutes en PK `serial`. **Vues/fonctions/triggers** : aucun.
- **Index** : uniquement PK + contraintes `unique` (aucun index secondaire — cf. Phase 7).

### 3.1 Schéma relationnel (résumé)

```
users ──┬─< activity_logs            clients ──< orders >── agencies
        ├─< modification_logs >── orders           │
        └─< notifications >── orders               ├─< order_items >── production_batches
orders ──< production_batches / expedition_batches │        └──────────> expedition_batches
orders ──< photometric_studies ──< photometric_study_items (>-- matieres)
order_items ──< item_technical_components >── material_categories / matieres
order_counters (année UNIQUE) — compteur N/AAAA
app_colors / system_settings — paramétrage runtime
production_unit_lib / article_library / tech_library — autocomplétion
backup_history — backups JSON intégraux (contenu en colonne text)
```

### 3.2 Tables et rôle métier

| Table | Rôle | Points clés |
|---|---|---|
| `users` | Comptes + rôle + préférence dark mode | `username` unique, `active` |
| `agencies` / `clients` | Référentiels commerciaux | `name` et `code` uniques |
| `orders` | Commande | **double statut** (commercial `status` + production `productionStatus`), verrou optimiste 5 min (`locked_by/at`), traces annulation |
| `order_items` | Articles | Specs techniques **par champ avec triplet valeur/par/le** (pcb, colorTemperature, lens, driver, electricalClass, accessories, otherTechSpecs), cumuls `produced_qty`/`delivered_qty` |
| `production_batches` / `expedition_batches` | Lots de production / livraison | `cumulative_total` dénormalisé, contrôlé côté API |
| `item_technical_components` | Composants matière choisis par article | Traçabilité individuelle `entered_by/at` — mise à jour **différentielle** (bug de traçabilité corrigé, commentaire dans le code) |
| `material_categories` / `matieres` | Catalogue matières | 8 catégories seedées (dont `telegestion-accessories`), stock double |
| `order_counters` | Numérotation N/AAAA | `SELECT … FOR UPDATE` en transaction = thread-safe |
| `activity_logs` / `modification_logs` | Audit global / audit par commande | Écrits par les helpers d'`auth.ts` et les routes |
| `notifications` | File par utilisateur | `read` booléen, polling 30 s côté client |
| `app_colors`, `system_settings` | Personnalisation couleurs, paramètres backup | Seedées à la demande |
| `photometric_studies(+_items)` | Études photométriques liées ou indépendantes | `order_id` nullable = étude libre |
| `production_unit_lib`, `article_library`, `tech_library` | Autocomplétion + compteur d'usage | — |
| `backup_history` | Sauvegardes JSON complètes | `backup_data` = dump complet en texte |

**Règles FK** : cascades sur suppression de commande (`order_items`, `item_technical_components`,
études) ; `restrict` sur catégorie de matière utilisée ; `set null` ailleurs. La route DELETE de
commande supprime manuellement les lots/logs/notifications avant l'en-tête (cohérent avec les FK).

---

## PHASE 4 — AUDIT DES API (40 endpoints)

Socle commun : `Authorization: Bearer <JWT>`, 401/403 standardisés, corps JSON, erreurs `{ error }`.

| Endpoint | Méthodes | Rôles | Objet / règles notables |
|---|---|---|---|
| `/api/auth/login` | POST | public | Seed admin paresseux, bcrypt, JWT 24 h, log LOGIN |
| `/api/auth/logout` `/me` | POST/GET | auth | Stateless ; `me` relit le profil |
| `/api/orders` | GET/POST | auth / superadmin+commercial | GET : filtres `status, agencyId, priority`, jointure client+agence, **batch** items + composants (pas de N+1, mais **aucune pagination**). POST : numéro auto `order_counters`, notifie `technique` + `planification` |
| `/api/orders/next-number` | GET | auth | Aperçu non incrémental du prochain N° |
| `/api/orders/[id]` | GET/PUT/DELETE | auth / mixte / superadmin | PUT = **cœur métier** : verrou 5 min (HTTP 423), sections par rôle (commercial → articles + statut commercial ∈ SUR_STOCK/BON_COMMANDE/PREVISION ; technique → specs + composants **différentiels** en transaction ; planification → priorité, statut production, annulation), logs de modifications champ par champ |
| `/api/orders/export` | GET | auth | Export Excel (xlsx) |
| `/api/production` | GET/POST | superadmin+planification | Lots bornés au reste à produire (`min(qty, remaining)`), refus si commande ANNULEE, LIMIT 300/500 |
| `/api/expedition` + `/[itemId]` | GET/POST/… | superadmin+planification | Lots d'expédition cumulés, chauffeur, date chargement |
| `/api/dashboard` | GET | auth | Agrégats (distributions, quantités, mensuel) |
| `/api/search` | GET | auth | Recherche globale commandes/articles/clients (≥ 2 car. côté client, debounce 300 ms) |
| `/api/clients`, `/api/agencies` (+`/[id]`) | CRUD | superadmin+commercial | Unicité code, soft-delete (`active`) |
| `/api/users` (+`/[id]`) | CRUD | superadmin | Gestion comptes, rôles, reset mdp |
| `/api/matieres` + `/search` | CRUD | superadmin+technique | Catalogue matières, stock |
| `/api/material-categories` (+`/[id]`) | CRUD | superadmin+technique | Clés stables, `isTelegestion`, ordre d'affichage |
| `/api/library/{articles,tech,production-units,affaires}` | GET/POST | auth | Autocomplétion + incrément `usage_count` |
| `/api/import` | POST (multipart) | superadmin+commercial | Import Excel clients/agences (dédoublonnage par code) ; les matières passent par `/api/matieres` |
| `/api/templates` | GET | auth | Templates Excel d'import |
| `/api/colors` | GET/PUT | auth / superadmin | Couleurs dynamiques par statut |
| `/api/notifications` (+`/[id]`) | GET/PUT | auth | File perso, filtre `unread=1` |
| `/api/order-modifications/[id]` | GET | auth | Historique des modifications d'une commande |
| `/api/activity` | GET | superadmin | Journal Watchdog |
| `/api/settings` | GET/PUT | superadmin | Paramètres sauvegarde auto (seed de 5 clés) |
| `/api/backup` | GET/POST | superadmin | Dump JSON intégral (ordre FK-safe) / restauration |
| `/api/backup/history`, `/download/[id]`, `/auto` | GET | superadmin | Historique, téléchargement, déclenchement planifié |
| `/api/photometric-studies` | CRUD | auth | Études liées commande ou libres |
| `/api/admin/reset-database` | POST | superadmin | Réinitialisation totale : mot de passe + texte `REINITIALISER` exigés |
| `/api/health` | GET | public | Sonde : seed admin + catégories, `{ ok: true }` |

**Constats** : validations par `parseInt`/présence (pas de schéma Zod) ; pas de rate-limit ;
pas d'appels vers des API externes ; pas de Server Actions ni d'upload hors Excel.

---

## PHASE 5 — LOGIQUE MÉTIER

**Cycle de vie d'une commande (workflow 4 rôles) :**

1. **commercial** crée la commande (N° auto `N/AAAA` via compteur transactionnel FOR UPDATE),
   statut commercial ∈ `SUR_STOCK / BON_COMMANDE / PREVISION`, production = `EN_INSTANCE`.
   Notifications automatiques aux rôles `technique` et `planification`.
2. **technique** renseigne les specs (7 champs tracés individuellement) et/ou sélectionne des
   **composants matière** (mise à jour différentielle : ajouts/suppressions logués un par un,
   créateurs d'origine préservés) → notification au créateur.
3. **planification** fixe priorité (`NORMALE/URGENTE/TRES_URGENTE`), unité de production,
   date de chargement, statut production (`EN_INSTANCE → EN_PRODUCTION → LIVREE`, `ANNULEE`
   avec motif + trace). Notification au créateur.
4. **production/expédition** enregistrent des **lots cumulés** bornés par les quantités
   commandées ; les cumuls `produced_qty`/`delivered_qty` vivent sur l'article (dénormalisation
   contrôlée par l'API).

**Règles implicites critiques (à ne jamais casser) :**
- Un article ayant des lots de production/expédition **ne peut plus être supprimé** (protégé au PUT).
- Statuts indépendants : le statut commercial ne dépend pas du statut production.
- Verrou d'édition 5 minutes par utilisateur (HTTP 423), auto-libéré en fin de PUT.
- `SUR_STOCK` rend l'agence optionnelle (`agencyId = 0` sinon) — le schéma impose NOT NULL.
- Seules les modifications « commerciales » renseignent `updated_by`.
- Les seeds (admin, catégories matière, settings, couleurs) sont **paresseux** : déclenchés par
  `/api/health`, `/api/auth/login`, etc. — ne pas les supprimer.

---

## PHASE 6 — AUDIT DE SÉCURITÉ

**Points solides** ✅ — bcrypt(10) ; requêtes paramétrées Drizzle (pas d'injection SQL) ;
JWT vérifié + rôle re-contrôlés côté serveur sur chaque route (401/403 homogènes) ; React échappe
le HTML (XSS limité) ; `poweredByHeader: false` ; secrets lus via `process.env` ; endpoint de
reset protégé par double confirmation ; `friendlyDbErrorMessage` évite les fuites techniques au client.

**Risques identifiés** ⚠️ (par criticité décroissante) :

1. **Élevé — Dépendances vulnérables** : `npm audit` = 12 vulns dont 7 high (`nanoid` ≤3.3.17,
   avis `next` ≤ previews, `postcss` XSS/sourcemap, `sharp`/libvips CVE ; `xlsx` 0.18.5 connu pour
   ReDoS/pollution historiques). Correctifs possibles mais certains hors plage semver → **plan de
   montée de version à valider avant toute application** (risque de régression).
2. **Élevé — Token en `localStorage`** (`otp_token`) : exfiltrable par toute XSS. L'en-tête Bearer
   rend le CSRF non applicable, mais un passage en cookie httpOnly+SameSite serait plus robuste.
3. **Moyen — Pas de rate-limiting** sur `/api/auth/login` (force brute possible) ; pas de
   verrouillage de compte ; JWT 24 h sans rotation/révocation (stateless).
4. **Moyen — Fallback de secret JWT en clair** dans `src/lib/auth.ts` : en l'absence de
   `JWT_SECRET`, des tokens forgeables. Mitigé en recette par un `.env` généré (64 octets hex).
5. **Moyen — Identifiants par défaut** `admin / admin123` réaffichés sur l'écran de login et
   recréés paresseusement : mot de passe à changer à la première mise en production.
6. **Faible — Import Excel** : pas de limite de taille/type déclarée (parsing `xlsx` en mémoire).
7. **Faible — Validations d'entrée** minimalistes (pas de schéma déclaratif), longueurs non bornées
   (champs `text`).
8. **Info — Sauvegarde JSON** contient `password_hash` (dump intégral en clair côté fichier) :
   à protéger au niveau stockage.

---

## PHASE 7 — AUDIT DES PERFORMANCES

**Sains** ✅ — Pas de N+1 : `GET /api/orders` batch via `inArray` ; LIMIT 300/500 en
production/expédition ; liste d'onglets hoisted ; debounce recherche ; connexion DB paresseuse
(build indépendant de la DB) ; compression gzip ; `force-dynamic` assumé partout (pas de cache
stale possible).

**À surveiller** ⚠️ (optimisations possibles **sans changement fonctionnel**) :
- `GET /api/orders` = **full scan + chargement intégral** (commandes × articles × composants) :
  croîtra avec l'historique → pagination/fenêtrage à étudier (impact UI à valider avant).
- **Aucun index secondaire** (jointures FK `order_id`, `item_id`, filtres `status/agency_id`) :
  ajout d'index = gain pur sans effet de bord, à planifier.
- Polling notifications toutes les 30 s par client connecté.
- Bundle client monolithique (toutes les vues dans `page.tsx` → pas de code-splitting par onglet).
- Dump backup = lecture intégrale de 19 tables en mémoire (OK à taille modérée).

---

## PHASE 8 — QUALITÉ DU CODE

| Axe | Évaluation |
|---|---|
| Typage | `strict` actif, types partagés `src/lib/types.ts`, `$inferSelect` Drizzle — bon |
| Conventions | Cohérentes, commentaires métier en français, routes toutes structurées pareil |
| Gestion d'erreurs | `{ error }` + codes HTTP propres ; `friendlyDbErrorMessage` pédagogique (42P01, 28P01…) |
| Journalisation | Métier riche (activity + modification logs) ; techniques : `console.error` uniquement |
| Patterns | Contexts React, helpers centralisés, seed paresseux, Proxy lazy DB, mise à jour différentielle |
| Tests | **Aucun** (ni unitaire, ni e2e) — dette principale |
| Dette notoire | Absence de migrations versionnées (push only) ; doublon `drizzle.config.json` (URL en dur) vs `.ts` ; `OrderItemLike`/types locaux dans la route `[id]` ; zéro validation de schéma ; fichiers Windows `.bat` couplés au LAN de l'entreprise |

---

## PHASE 9 — BUILD & DÉPLOIEMENT

- **Build** : `next build` (Turbopack interne Next 16) — validé : 40 routes API `ƒ`, `/` et `/login` statiques.
- **Démarrage** : `next start` (0.0.0.0 via scripts `.bat` pour partage LAN). Healthcheck `/api/health`.
- **Init DB** : `npx drizzle-kit push` (requis, documenté). Aucune migration/versioning.
- **Sauvegardes** : 2 mécanismes — dump manuel/auto JSON (API `backup`, historisé en base) **et**
  planificateur **côté navigateur** (`backup-scheduler.ts`, File System Access API + IndexedDB,
  fallback téléchargement ; actif uniquement pour superadmin connecté). **Pas de sauvegarde
  serveur hors base** ni de stratégie de restauration testée documentée.
- **CI/CD** : absent du dépôt. **Docker** : absent. **Electron** : types présents, shell externe.
- **Recette effectuée** : import fidèle → env `.env` (DATABASE_URL + JWT_SECRET généré) →
  install deps → push schéma (22 tables) → build → health OK → tests login/orders/dashboard/next-number OK.

---

## PHASE 10 — SYNTHÈSE, RISQUES ET OPPORTUNITÉS

### Guide express d'installation (recette validée)
1. `npm install` 2. `.env` : `DATABASE_URL` + `JWT_SECRET` (≥32 car. aléatoires)
3. `npx drizzle-kit push` 4. `npm run build && npm start` 5. Login `admin/admin123` → **changer le mot de passe**.

### Risques principaux
| # | Risque | Impact | Action proposée (avec votre accord) |
|---|---|---|---|
| R1 | Dépendances vulnérables (7 high) | Sécurité | Montées de version contrôlées + non-régression |
| R2 | Pas de tests | Régression | Ajouter smoke tests API avant toute évolution |
| R3 | DB sans migrations/index secondaires | Perf/évolutivité | Introduire migrations + index (sans changer le schéma logique) |
| R4 | Rate-limit absent / token localStorage | Sécurité | Rate-limit login ; étude cookie httpOnly |
| R5 | Requête commandes non paginée | Perf à l'échelle | Fenêtrage après accord (touche l'UI) |

### Questions ouvertes (aucune hypothèse retenue)
1. Le shell **Electron** est-il maintenu dans un autre dépôt ? (types présents ici, code absent)
2. Volume réel en production (nb commandes/mois) pour calibrer R3/R5 ?
3. La règle `agencyId = 0` pour `SUR_STOCK` est-elle voulue long terme (agence « virtuelle » id 0 absente de la table) ?
4. Restauration backup : procédure opérationnelle validée quelque part (hors `/api/backup` POST) ?
5. `drizzle.config.json` (URL en dur) est-il encore utilisé par vos scripts, ou supprimable ?

---

## PROCESSUS POUR TOUTE ÉVOLUTION (engagement)

Avant chaque modification : (1) expliquer l'existant → (2) lister les fichiers impactés →
(3) analyser les impacts → (4) évaluer les régressions → (5) proposer le rollback →
(6) définir la stratégie de tests → (7) **attendre votre autorisation explicite**.

*État de recette au moment de l'audit : build ✅ · typecheck ✅ · typegen ✅ · healthcheck ✅ ·
login/orders/dashboard/next-number ✅ (base vide, seeds appliqués).*
