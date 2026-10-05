# Phase 6 — Audit de sécurité

Périmètre : authentification, sessions, contrôle d'accès, injections, secrets,
uploads, dépendances. Vérifié par lecture intégrale du code (aucun test dynamique).

## 6.1 Points forts (à préserver)

1. **Mots de passe** : bcrypt cost 10, jamais renvoyés ni loggés.
2. **Requêtes SQL** : 100 % ORM paramétré, sauf deux `sql.raw` sur **listes
   blanches codées en dur** (`backup/route.ts` resync séquences, `reset-database`
   TRUNCATE) → **pas d'injection SQL identifiée**.
3. **XSS** : aucun `dangerouslySetInnerHTML`, aucun `eval`/`new Function` ;
   affichage échappé par React.
4. **Secrets Google Drive** : chiffrés au repos **AES-256-GCM** (IV aléatoire,
   tag d'authenticité), jamais exposés au frontend (masquage `123456…cdef`),
   jamais dans les logs ; échange du code OAuth côté serveur uniquement.
5. **OAuth state** vérifié strictement au callback (anti-CSRF du flux), scope
   offline + consent pour obtenir un refresh token.
6. **Contrôle d'accès côté serveur** sur 67/71 routes (les 4 publiques sont
   login, callback OAuth protégé par state, health, next-number). Le rôle est
   revérifié par route, jamais délégué au frontend.
7. **Reset DB** : double barrière (rôle SA + mot de passe + texte de
   confirmation), transactionnel (« aucune suppression partielle »).
8. **CSRF classique** : non applicable côté session (token en en-tête
   `Authorization`, pas de cookie) — réduit la surface.
9. `poweredByHeader: false`, `.env` correctement gitignoré, **aucun secret
   commité** (vérifié `git ls-files`).
10. Traçabilité applicative extensive (activity/modification/recouvrement logs)
    — atout forensic.

## 6.2 Vulnérabilités et faiblesses (par criticité)

### Critiques

| ID | Constat | Preuve | Impact |
|---|---|---|---|
| SEC-1 | **Secret JWT de repli codé en dur** : `process.env.JWT_SECRET ‖ "otp-super-secret-jwt-key-2024"` | `src/lib/auth.ts:7` | Si `JWT_SECRET` est absent en prod, n'importe qui forge des tokens SA valides. Le `.bat` génère bien un secret en local, mais rien ne le garantit ailleurs (Vercel…). |
| SEC-2 | **Compte par défaut `admin/admin123` re-seedé automatiquement** et **identifiants affichés sur la page de login** | `src/lib/auth.ts:27-34`, `login/route.ts:12`, `src/app/login/page.tsx` | Accès SA trivial si le mot de passe n'est pas changé ; re-créé après reset. |

### Élevées

| ID | Constat | Preuve | Impact |
|---|---|---|---|
| SEC-3 | **Aucune limitation de débit** sur `/api/auth/login` | route login | Brute force / password spraying sans entrave (réseau LAN + potentiellement Internet). |
| SEC-4 | **JWT en `localStorage`** (`otp_token`) | `src/lib/api.ts` | Vol du token par toute XSS future ; surface accrue par les extensions. (La probabilité XSS est faible aujourd'hui, l'impact serait total.) |
| SEC-5 | **Dépendance `xlsx@0.18.5`** : CVE-2023-30533 (Prototype Pollution) et CVE-2024-22363 (ReDoS) **sans correctif sur npm** (SheetJS ne publie plus sur npm) | `package.json` | Parsing Excel d'imports clients/archive : fichiers malveillants fournis par un utilisateur authentifié. Mitigation partielle : import réservé SA/COM. |

### Moyennes

| ID | Constat | Preuve | Impact |
|---|---|---|---|
| SEC-6 | **Session non révocable** : logout purement indicatif ; `active=false` ou changement de rôle non pris en compte avant l'expiration (24 h) | `auth/logout`, `auth.ts` | Un compte désactivé/rétrogradé garde ses droits jusqu'à 24 h. |
| SEC-7 | **JWT accepté en query string** pour le téléchargement (`?token=`) | `storage/download/[id]/route.ts` | Fuite du token dans les logs serveur/proxy et l'historique navigateur. |
| SEC-8 | `GET /api/orders/next-number` **publique** | route sans auth | Divulgation du compteur d'activité (faible, mais incohérent avec le reste). |
| SEC-9 | **Absence totale d'en-têtes de sécurité** (CSP, `X-Frame-Options`, `Referrer-Policy`…) et de middleware | `next.config.ts` | Clickjacking, ressources externes non bornées si XSS. |
| SEC-10 | **`drizzle.config.json` contient des credentials en dur** (`postgres:postgres@127.0.0.1`) et fait doublon avec `drizzle.config.ts` | racine | Confusion d'environnement, fuite d'info locale, risque de push sur la mauvaise base. |
| SEC-11 | Comparaison `x-backup-secret` non **timing-safe** ; secret optionnel non documenté | `backup/auto/route.ts` | Mineur (usage cron), mais à documenter/durcir. |

### Faibles / hygiène

- `parseInt` sans garde sur IDs de routes/query (`NaN` → erreur pg 500 plutôt que 400).
- Pas de validation de schéma (zod) : bornes (quantités, tailles de chaînes) assurées par le code appelant.
- Pas de rate-limit/audit sur les accès refusés (403 non journalisés).
- `allowedDevOrigins` contient une IP LAN codée en dur (`192.168.0.199`) — sans impact prod.
- Message d'erreur de login distinguant « compte désactivé » — énumération d'existence possible (faible en contexte interne).
- SSL `rejectUnauthorized: false` automatique dès que l'URL contient `neon.tech`/`supabase`/`sslmode=require` — MITM théorique sur légère mauvaise config.

## 6.3 Gestion des secrets — bonnes pratiques respectées

Secrets uniquement en variables d'environnement côté serveur ; secrets Drive
chiffrés en DB ; aucune variable `NEXT_PUBLIC_*` sensible. **Manque** :
`APP_ENCRYPTION_KEY` et `BACKUP_SECRET` absentes de `.env.example`.

## 6.4 Dépendances — veille

`next 16.2.6`, `react 19.2.6`, `jose 6.x`, `bcryptjs 3.x`, `pg 8.20`, `drizzle
0.45.2` : versions récentes ≥ aux correctifs publics connus à la date de l'audit
(y compris les correctifs RSC/React2Shell de fin 2025). **Exceptions** : `xlsx`
(cf. SEC-5), `lucide-react@1.38.0` (version étonnamment ancienne vs la branche
0.x courante — fonctionnel, à surveiller), `@types/xlsx` stub. **Absence de
lockfile** : les dépendances `^` peuvent dériver entre deux installations — à
corriger (voir `10-RISQUES-AMELIORATIONS.md`). Exécuter `npm audit --omit=dev`
à chaque livraison.
