# Phase 8 — Audit de la qualité du code

## 8.1 Appréciation générale

Codebase **sérieuse et cohérente** pour un outil métier interne : typage strict,
séparation nette `db / lib / api / components`, commentaires français denses qui
documentent les règles métier et **l'historique des bugs corrigés** (ex. FK
`agency_id=0`, traçabilité différentielle des composants). Les commentaires
« RÉTROCOMPATIBILITÉ / NE PAS … / SOURCE UNIQUE DE VÉRITÉ » montrent une culture
de non-régression réelle.

## 8.2 Design patterns observés

| Pattern | Où | Qualité |
|---|---|---|
| **Source unique de vérité** | `production-apply.ts` partagée Production/Planning | Excellent — évite la divergence des deux chemins |
| **Seed idempotent** (« insert si clé absente, jamais d'écrasement ») | `material-categories.ts`, `recouvrement.ts`, `archive.ts`, `production-planning.ts` | Bon et uniforme |
| **Verrou applicatif** (édition 5 min) | PUT `/api/orders/[id]` | Simple, adapté à l'usage |
| **Idempotence métier** | `applied_qty/applied_at` du planning | Bon |
| **Compteur transactionnel** | `order-number.ts` (FOR UPDATE) | Correct sous concurrence |
| **Lazy singleton** (Proxy sur globalThis) | `db/index.ts` | Bon pour Next (HMR + build sans DB) |
| **Context providers** | auth/couleurs/modifications | Suffisant à cette échelle |

## 8.3 Typage

- `strict: true`, `allowJs: false`, types partagés `src/lib/types.ts`,
  inférence Drizzle (`$inferSelect`). Peu de `any` (confignés aux Proxys db avec
  eslint-disable ciblé). `params` typé en `Promise` (convention Next 15/16
  respectée).
- Faiblesse : corps de requêtes API typés `unknown`/`Record<string, unknown>`
  puis accès directs — la validation reste manuelle (pas de zod).

## 8.4 Conventions & lisibilité

Nommage FR métier constant, constantes regroupées (`*-constants.ts`),
structure de routes homogène. **Exceptions notables** :

1. **Helper `auth()` dupliqué** dans ~20 routes alors que `src/lib/api-helpers.ts`
   (`checkAuth`/`authError`) existe et n'est **utilisé nulle part**.
2. Composants très volumineux : `OrdersView.tsx` **992 lignes**,
   `BackupView 640`, `StorageView 544`, `ArchiveView 511`,
   `PlanningProductionView 505` — découpage interne faible.
3. Deux configs Drizzle qui divergent (`drizzle.config.ts` vs `.json`).
4. `package.json > name = "nextjs-postgresql-template"` (jamais renommé).
5. Historique de vieillissement visible : anciennes priorités, anciennes
   méthodes d'auth conservées « par rétrocompatibilité » — assumé et documenté.

## 8.5 Gestion des erreurs & journalisation

- API : `try/catch` systématiques, messages FR propres via
  `friendlyDbErrorMessage` (codes pg → messages exploitables, ex. 42P01).
- Côté métier : les erreurs de règles renvoient 400/403 explicites ; la
  promotion de priorités **ne peut pas** faire échouer un lot (catch dédié) —
  bonne isolation.
- Journalisation : `console.error` uniquement — pas de logger structuré, pas
  de collecte centralisée ; acceptable en auto-hébergement, fragile en PaaS.
- Transactions présentes aux bons endroits (tech différentielle, reset,
  restauration, études photométriques) ; **absentes** sur certaines séquences
  multi-écritures (création commande + items + notifications) — une panne au
  milieu laisserait une commande partielle.

## 8.6 Tests & CI

**Aucun test** (ni unitaire, ni e2e, ni script), aucune CI. C'est la plus grosse
dette du projet pour un outil qui gère des flux de production réels : la
numérotation transactionnelle, l'idempotence planning et la promotion des
priorités sont des candidats évidents à des tests de non-régression.

## 8.7 Dette technique consolidée (voir aussi Phase 10)

| Gravité | Élément |
|---|---|
| Haute | Absence de tests + absence de lockfile |
| Moyenne | Helper auth dupliqué / api-helpers morts ; OrdersView monolithique ; absence de migrations versionnées (push direct) ; transactions manquantes sur création de commande |
| Faible | Drizzle config en double ; nom du package ; IP LAN en dur ; commentaires « dead code » conservés ; lucide-react ancien |
