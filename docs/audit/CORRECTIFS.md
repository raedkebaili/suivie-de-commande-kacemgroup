# Correctifs appliqués — Plan de remédiation de l'audit

> Statut : **appliqué, compilé, testé de bout en bout** (build de production ✓,
> TypeScript strict ✓, 32 tests unitaires ✓, tests d'acceptation curl ✓).
> La logique métier, les contrats d'API et l'architecture sont préservés :
> tous les changements sont **additifs ou sécurisants**, sans suppression de
> fonctionnalité (hors retrait Electron demandé).

## Tableau de conformité

| # | Risque (audit) | Correctif | Fichiers | Vérifié |
|---|---|---|---|---|
| R1 | Secret JWT codé en dur | `JWT_SECRET` exigé, vérification à l'usage (aucune valeur de repli) | `lib/auth.ts` | build ✓ |
| R2 | admin/admin123 affiché + jamais forcé | Suppression de l'indice ; compte semé temporaire `Admin@2024` + **`must_change_password`** + écran forcé bloquant toute l'app ; nouvelle route `POST /api/auth/change-password` | `auth.ts`, schéma, `login/page.tsx`, `ForcePasswordChange.tsx`, `auth/change-password` | curl 4–6 ✓ |
| R3 | Sauvegarde auto liée à un navigateur ouvert | **Planificateur côté serveur** (instrumentation Next.js, vérification chaque minute, idempotent par jour) ; secret cron en comparaison timing-safe avec repli `JWT_SECRET` | `instrumentation.ts`, `backup/auto/route.ts` | log serveur ✓ |
| R4 | Force brute sur le login | Rate limiting en mémoire : **5 échecs / 15 min** par IP+identifiant, 429 + `Retry-After`, reset au succès, journal `LOGIN_FAILED` | `lib/rate-limit.ts`, `auth/login` | curl 7 ✓ |
| R5 | IDOR notifications | Clause `(id, userId)` obligatoire ; 404 hors périmètre | `notifications/[id]` | curl 10 ✓ |
| R6 | En-têtes de sécurité absents | `nosniff`, `DENY`, `Referrer-Policy`, `Permissions-Policy` + **CSP** (page OAuth exclue proprement) | `next.config.ts` | curl 11 ✓ |
| R7 | Pas de migrations versionnées | `drizzle-kit generate` → `drizzle/0000_baseline.sql` + scripts `db:push`/`db:generate` | `drizzle/` | ✓ |
| R8 | Hash exportés dans les sauvegardes | Export **sans `password_hash`** ; restauration : comptes concernés → mot de passe temporaire aléatoire + changement forcé, communiqué une fois à l'admin | `backup-data.ts`, `backup/route.ts` | curl 12 ✓ |
| R9 | Rôle/actif figés 24 h dans le JWT | Expiration JWT **12 h** + **re-validation en base à chaque appel** (rôle toujours frais, compte désactivé ⇒ 401 immédiat) | `auth.ts` | curl 8 ✓ |
| R10 | Aucune politique de mot de passe | ≥ 8 caractères + lettre + chiffre ; appliquée à création, réinitialisation admin et changement utilisateur ; coût **bcrypt 12** | `password-policy.ts`, routes `users`, `change-password` | curl 4 ✓ |
| R11 | Endpoint public + state OAuth détourné | `GET /api/library/production-units` authentifié ; `state` OAuth déplacé dans `system_settings` (usage unique) | 3 fichiers | curl 2 ✓ |
| R12 | Dépendances Electron | **Suppression totale** : `electron.d.ts`, pont de raccourcis `page.tsx`, écouteurs `OrdersView` (File System Access conservé dans son propre fichier de types) | 3 fichiers | grep = 0 ✓ |
| R2-vuln | Lockfile absent | `package-lock.json` régénéré (364 Ko) et à engager | racine | ✓ |
| P1 | Index FK manquants | **23 nouveaux index** sur les FK massives (order_items, batches, composants, logs, notifications, archive, études, planning) — DDL additive | `schema.ts` + push DB | SQL ✓ |
| R6-tests | Zéro test, zéro CI | **Vitest + 32 tests** sur les libs critiques (priorités, états visuels, regroupement, archive, sécurité) — script `npm test` | `lib/__tests__/` | 32/32 ✓ |
| D9 | Métadonnées `package.json` | Nom `ordertrack-pro` | `package.json` | ✓ |
| D2 | Code mort `dbFromImport` | Supprimé dans `users/[id]`, `agencies/[id]`, `clients/[id]` | 3 fichiers | grep = 0 ✓ |
| PERF | Bundle initial (17 vues) | `next/dynamic` par onglet — chargement à la demande, comportement identique | `page.tsx` | build ✓ |
| UX | Emojis dans l'UI | Remplacés par SVG inline (callback OAuth) et texte (recherche) | 2 fichiers | ✓ |

## Procédure de retour arrière (rollback)

Chaque correctif est isolé et réversible :

1. **Code** : le projet reste la copie exacte du dépôt d'origine + commits de
   correctifs — annulation ciblée par fichier (les blocs sont balisés
   « CORRECTIF » dans les commentaires).
2. **Base de données** : la colonne `must_change_password` et les index sont
   additifs ; les supprimer ne casse aucune donnée (`ALTER TABLE … DROP`,
   `DROP INDEX` — aucun effet sur le contenu).
3. **Config** : retirer les en-têtes = supprimer la clé `headers()` de
   `next.config.ts`.
4. **Sauvegardes restaurées anciennes** : les comptes sans hash reçoivent un
   mot de passe temporaire + changement forcé (réversible en réinjectant un
   hash via l'onglet Utilisateurs).

## Points d'attention post-déploiement

- **Premier démarrage** : connexion admin avec `Admin@2024` ⇒ changement
  obligatoire (l'écran bloquant se substitue à toute l'application).
- Mettre à jour `INSTALL-GUIDE.md` sur le poste de prod : nouvelles variables
  obligatoires `APP_ENCRYPTION_KEY` et `BACKUP_SECRET` (voir `.env.example`).
- `npm audit` signale encore des vulnérabilités transitives (dont `xlsx`
  via la chaîne npm) — surveillées ; aucune version corrigée officielle
  disponible sur npm à ce jour.
- Les utilisateurs ayant un jeton émis avant cette version devront se
  reconnecter (durée réduite à 12 h).
