# 00 — Cartographie globale (Phase 1)

## Identité du projet

| Élément | Valeur constatée | Preuve |
|---|---|---|
| Nom produit | **OrderTrack Pro** — « Gestionnaire des Commandes » | `layout.tsx`, `login/page.tsx` |
| Métier | Suivi du cycle commande → production → expédition pour un industriel de l'éclairage (Kacem Group) | code métier |
| `package.json#name` | `nextjs-postgresql-template` (jamais renommé — dette mineure) | `package.json` |
| Framework | **Next.js 16.2.6**, App Router | `package.json` |
| UI | **React 19.2.6**, **Tailwind CSS 4.1.17** via `@tailwindcss/postcss` | `package.json`, `postcss.config.mjs` |
| Langage | **TypeScript 5.9.3**, `strict: true`, `allowJs: false` | `tsconfig.json` |
| Runtime Node | **Non épinglé** (pas de `.nvmrc`, pas de champ `engines`) | racine, `package.json` |
| Gestionnaire de paquets | **npm** — **sans lockfile à l'état actuel** (voir risques) | `ls` racine, `git log -- package-lock.json` |
| Base de données | **PostgreSQL** (driver `pg` 8.20.0, pool max 20) | `src/db/index.ts` |
| ORM | **Drizzle ORM 0.45.2** + drizzle-kit 0.31.10 — **mode `push`, aucun dossier de migrations** | `drizzle.config.ts` |
| Authentification | JWT **HS256** (`jose` 6.x) + **bcryptjs** 3.x (coût 10) | `src/lib/auth.ts` |
| Excel | `xlsx` 0.18.5 (import/export, chargé dynamiquement) | routes `import`, `export`, `archive` |
| Graphiques | `recharts` 3.x (tableau de bord) | `DashboardView.tsx` |
| Icônes | `lucide-react` 1.x | composants |
| Intégration cloud | **Google Drive** : `@googleapis/drive`, `@googleapis/oauth2`, `google-auth-library` | `src/lib/google-drive.ts` |
| Env | `dotenv` 17 (chargé par `drizzle.config.ts`) | `drizzle.config.ts` |

Observation d'hygiène : `@types/bcryptjs` et `@types/xlsx` sont dans
`dependencies` au lieu de `devDependencies` (aucun impact fonctionnel).

## Scripts npm

| Script | Commande | Usage |
|---|---|---|
| `dev` | `next dev` | développement |
| `build` | `next build` | build de production (la connexion BD est **paresseuse**, donc le build passe sans `DATABASE_URL`) |
| `start` | `next start` | serveur de production |
| `lint` | `eslint .` | flat config `eslint-config-next/core-web-vitals` |
| `typecheck` | `tsc --noEmit` | vérification stricte |

## Configuration

- **`next.config.ts`** : `allowedDevOrigins` (localhost + IP LAN +
  `NEXT_ALLOWED_DEV_ORIGINS`), `poweredByHeader: false` (bonne pratique),
  `compress: true`, `reactStrictMode: true`. Commentaires réseau LAN.
- **`tsconfig.json`** : strict, alias `@/* → ./src/*`, `moduleResolution:
  bundler`, plugin Next.
- **`drizzle.config.ts`** : refuse de démarrer sans `DATABASE_URL` ;
  `drizzle.config.json` (doublon) pointe vers `127.0.0.1:5432/app_db`.
- **`.gitignore`** complet (`.env`, `backups/`, `.next/`, `dist/`).

## Variables d'environnement

| Variable | Rôle | Requis | Remarque |
|---|---|---|---|
| `DATABASE_URL` | connexion PostgreSQL | **oui** (runtime) | SSL auto si `sslmode=require` / Neon / Supabase |
| `JWT_SECRET` | signature HS256 | **recommandé** | **fallback codé en dur** si absent (voir 05) |
| `NEXT_PUBLIC_APP_URL` | URL publique | non | base du redirect OAuth Drive |
| `DB_POOL_MAX` | taille pool `pg` (défaut 20) | non | |
| `APP_ENCRYPTION_KEY` | clé AES-256-GCM (secrets Drive) | recommandé | fallback dérivé de `JWT_SECRET` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Drive en secours | non | priorité à la config en base |
| `GOOGLE_REDIRECT_URI` | force l'URL de callback | non | sinon déduite de la requête |
| `NEXT_ALLOWED_DEV_ORIGINS` | origines HMR supplémentaires | non | |

## Système de build et de déploiement

- **Build** : `next build` standard ; la base n'est initialisée qu'à la
  première requête (proxy paresseux) — le build passe sans BD.
- **Déploiement cible principal** : **poste Windows en réseau local** via
  `setup.bat` (installe Node LTS + PostgreSQL 17 par winget, génère `.env` et
  un `JWT_SECRET` aléatoire, crée la base, `drizzle-kit push`, `npm install`,
  build, service Windows optionnel « OrderTrackPro ») et
  `start-ordertrack.bat` (healthcheck `/api/health`, démarrage service ou
  `next start`, ouverture navigateur, affichage de l'IP LAN).
- **Shell desktop** : `src/types/electron.d.ts` + raccourcis
  (`window.electronAPI.onShortcut`) — le projet Electron est **hors dépôt**.
- **Compatible Vercel/Neon** par construction (connexion paresseuse + SSL).
- **Absents** : Dockerfile, CI/CD, pipeline de tests, migrations SQL
  versionnées, lockfile.
