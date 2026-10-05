# 07 — Qualité du code (Phase 8)

## Appréciation générale

Code **homogène, pragmatique et fortement documenté en français**. La
qualité des commentaires est remarquable : ils expliquent le *pourquoi*
métier, historient les corrections (« CORRECTION BUG TRAÇABILITÉ… ») et
balisent les ajouts rétrocompatibles. TypeScript `strict` partout,
`allowJs: false`. L'architecture privilégie la **stabilité** : extensions
additives, jamais de réécriture.

## Design patterns reconnus

| Pattern | Mise en œuvre |
|---|---|
| Singleton paresseux | pool `pg` + client Drizzle via `Proxy` sur `globalThis` (survit au HMR) |
| Seed idempotent par clé | admin, couleurs, catégories, états — insertion si absente, jamais d'écrasement |
| Source unique de vérité | `production-apply.ts`, `backup-data.ts`, `collectBackupData` partagés entre plusieurs routes |
| Modules « purs » partagés client/serveur | `priority.ts`, `production-planning-constants.ts`, `archive-constants.ts`, `article-grouping.ts`, `document-categories.ts` (aucun import `@/db`) |
| Helper d'autorisation | `getUserFromHeaders` + `auth(req, roles)` local par route |
| Traçabilité systématique | `logActivity` / `logModification` / `notifyUser` dans chaque mutation |
| Optimistic locking court | verrou 5 min sur `PUT /api/orders/[id]` |
| Garde d'idempotence | `applied_qty/applied_at` du planning |
| Copie historique (snapshot) | noms copiés sur lots, composants, études, entrées de planning |

## Typage

- `strict` respecté ; types inférés Drizzle (`$inferSelect/$inferInsert`).
- Assertions `as Record<string, unknown>` pour les updates dynamiques
  (pratique mais partiellement non vérifiée) ; `unknown` + gardes sur les
  payloads ; types Electron isolés (`src/types/electron.d.ts`).
- Pas de schéma de validation déclaratif (zod…) : les validations sont
  manuelles, exhaustives sur les points critiques mais hétérogènes.

## Conventions & lisibilité

- Nommage **français métier** cohérent (variables, journaux, messages
  d'erreur) ; anglais réservé à l'infrastructure.
- Organisation prévisible : `app/api/<domaine>/route.ts`,
  `components/<Domaine>View.tsx`, `lib/<domaine>.ts`.
- Formatage **hétérogène** : quelques fonctions compactées
  (`F()`, `AutocompleteSelect` dans `OrdersView.tsx`), lignes longues.
- Gestion d'erreurs : `try/catch` + `console.error` systématiques et
  messages utilisateur conviviaux (`friendlyDbErrorMessage` pour 42P01 /
  ECONNREFUSED, `friendlyDriveError` pour Google).

## Journalisation

- **Métier** : `activity_logs` (login, CRUD, imports, sauvegardes) et
  `modification_logs` (avant/après par champ) — consultable via Watchdog
  (superadmin).
- **Technique** : console non structurée (pas de niveau, pas de sortie
  JSON, pas de rotation) — suffisant sur poste unique, à revoir si
  centralisation nécessaire.

## Dette technique identifiée (inventaire, non corrigée)

| # | Dette | Fichier(s) | Gravité |
|---|---|---|---|
| D1 | Helper `auth()` **dupliqué ~40×** au lieu d'utiliser `api-helpers.checkAuth` | routes API | faible |
| D2 | Code mort : `const db = dbFromImport;` (shadow inutile) | `users/[id]`, `agencies/[id]`, … | trivial |
| D3 | Absence totale de **tests** (unitaires, intégration, e2e) | repo entier | élevée |
| D4 | **Lockfile absent** → installations non reproductibles | racine | élevée |
| D5 | Aucun middleware / headers de sécurité centralisés | `next.config.ts` | moyenne |
| D6 | Composants géants (`OrdersView` ≈ 1 070 lignes, `BackupView` 640) | components | moyenne |
| D7 | `settings` : clés dispersées (`backup_*`, `orders_hidden_*`) sans registre central | routes | faible |
| D8 | OAuth `state` stocké dans `storage_config.lastError` (champ détourné) | oauth/start, callback | faible |
| D9 | `package.json#name` resté `nextjs-postgresql-template` ; `@types/*` en `dependencies` | `package.json` | trivial |
| D10 | Vérification de rôle figée dans le JWT (pas de relecture en base) | `auth.ts` | moyenne |
| D11 | Pas de migrations versionnées (mode `push` seulement) | drizzle | moyenne |
| D12 | Formatage non automatisé (pas de Prettier) ; HTML inline dans callback OAuth | divers | faible |

## Lisibilité pour un repreneur

Bonne : les modules sont auto-contenus, les flux critiques (commande,
production, planning) sont balisés par des en-têtes de commentaires qui
documentent les invariants (« n'altère JAMAIS order_items directement… »).
La documentation commitée dans le dépôt (`AUDIT_COMPLET.md`,
`docs/audit-kacemgroup/`) est **synchronisée avec le code** et peut servir
de second point d'entrée.
