# Phase 1 — Cartographie globale du projet

## 1.1 Identité du projet

| Élément | Valeur observée | Source |
|---|---|---|
| Nom métier | **OrderTrack Pro** — « Gestionnaire des Commandes » Kacem Group | `package.json`, `src/components/Sidebar.tsx`, `src/app/login/page.tsx` |
| Objet | Plateforme interne de suivi de commandes clients : saisie commerciale, étude technique (composants électroniques d'éclairage : PCB, lentilles, drivers…), planification de production par usine, expéditions, recouvrement, archive Excel, stockage Google Drive | code + commits |
| `package.json > name` | `nextjs-postgresql-template` (nom de template jamais renommé) | `package.json` |
| Dépôt | branche unique `main`, **16 commits**, **0 tag**, messages en majuscules | `git log` |
| Métier sous-jacent | Éclairage / LED (champs `pcb`, `color_temperature`, `lens`, `driver`, `electrical_class`) + télégestion (éclairage public piloté à distance) | `src/db/schema.ts` |

## 1.2 Versions et runtime

| Composant | Version | Remarque |
|---|---|---|
| Next.js | **16.2.6** (App Router) | `eslint-config-next` aligné 16.2.6 |
| React / React DOM | **19.2.6** | concurrent features, `reactStrictMode: true` |
| TypeScript | **5.9.3** — `strict: true`, `allowJs: false` | `tsconfig.json` |
| Node.js | **≥ 18** requis (docs), `@types/node` 22.19.15 | `DEPLOYMENT.md`, `package.json` ; pas de `.nvmrc` ni de champ `engines` |
| PostgreSQL | 15/16/17 (chemins winget dans `setup.bat`), Neon possible | `setup.bat`, `DEPLOYMENT.md` |
| ORM | **Drizzle ORM 0.45.2** + `drizzle-kit 0.31.10` ; driver `pg 8.20.0` (Pool node-postgres) | |
| Tailwind CSS | **4.1.17** via `@tailwindcss/postcss` | pas de `tailwind.config.*` (v4, CSS-first) |
| Gestionnaire de paquets | **npm** | ⚠️ **aucun lockfile commité** (`package-lock.json` absent du dépôt) |

## 1.3 Dépendances de production (rôle)

| Dépendance | Version | Rôle dans le projet |
|---|---|---|
| `next`, `react`, `react-dom` | 16.2.6 / 19.2.6 | framework + UI |
| `drizzle-orm`, `pg` | 0.45.2 / 8.20.0 | accès PostgreSQL |
| `jose` | 6.2.10 | signature/vérification JWT (HS256) |
| `bcryptjs` (+`@types/bcryptjs`) | 3.0.3 | hachage des mots de passe (cost 10) |
| `xlsx` (+`@types/xlsx` 0.0.35) | **0.18.5** | import/export Excel (commandes, clients, archive) — ⚠️ CVE connus, voir `05-SECURITE.md` |
| `@googleapis/drive`, `@googleapis/oauth2`, `google-auth-library` | 26.0.1 / 10.0.1 / 11.1.0 | stockage centralisé Google Drive (OAuth2 offline) |
| `recharts` | 3.10.1 | graphiques du tableau de bord |
| `lucide-react` | 1.38.0 | icônes |
| `dotenv` | 17.3.1 | chargement `.env` (drizzle-kit) |

Dépendances de développement : Tailwind/PostCSS, TypeScript, ESLint 9.39 (flat config `core-web-vitals`), `drizzle-kit`, types (`node`, `pg`, `react`, `react-dom`).

## 1.4 Scripts npm

| Script | Commande | Observation |
|---|---|---|
| `dev` | `next dev` | — |
| `build` | `next build` | — |
| `start` | `next start` | production |
| `lint` | `eslint .` | flat config |
| `typecheck` | `tsc --noEmit` | — |

**Absents** : aucun script de test, de migration (`db:push`/generate), de seed, de format.

## 1.5 Fichiers de configuration

| Fichier | Contenu clé |
|---|---|
| `next.config.ts` | `allowedDevOrigins` (localhost + IP LAN codée en dur `192.168.0.199` + env `NEXT_ALLOWED_DEV_ORIGINS`), `poweredByHeader: false`, `compress: true`, `reactStrictMode: true` |
| `tsconfig.json` | strict, `moduleResolution: bundler`, alias `@/* → ./src/*`, inclut `**/*.ts(x)` |
| `drizzle.config.ts` | lit `DATABASE_URL` depuis `.env` (échoue explicitement si absent) |
| `drizzle.config.json` | supprimé : il ne doit exister aucune connexion locale codée en dur |
| `eslint.config.mjs` | `eslint-config-next/core-web-vitals` + ignores |
| `postcss.config.mjs` | `@tailwindcss/postcss` uniquement |
| `.gitignore` | correct : `.env*`, `node_modules`, `.next`, `backups/`, `dist/` |

Absents : `middleware.ts` (aucun), `vercel.json`, `Dockerfile`, `.github/` (aucune CI/CD), dossier `drizzle/` de migrations (schéma appliqué par `drizzle-kit push`).

## 1.6 Variables d'environnement

| Variable | Documentée `.env.example` ? | Usage réel (vérifié dans le code) |
|---|---|---|
| `DATABASE_URL` | ✅ | connexion PostgreSQL (`src/db/index.ts`) |
| `JWT_SECRET` | ✅ | signature JWT (`src/lib/auth.ts`) — ⚠️ valeur de repli codée en dur si absente |
| `NEXT_PUBLIC_APP_URL` | ✅ | liens absolus |
| `DB_POOL_MAX` | ✅ (commentée) | taille du pool (défaut 20) |
| `APP_ENCRYPTION_KEY` | ❌ **non documentée** | AES-256-GCM pour secrets Drive (`src/lib/crypto.ts`) ; repli = dérivation de `JWT_SECRET` |
| `BACKUP_SECRET` | ❌ **non documentée** | en-tête `x-backup-secret` pour cron de sauvegarde (`api/backup/auto`) |
| `NEXT_ALLOWED_DEV_ORIGINS` | ❌ non documentée | origines HMR supplémentaires |

## 1.7 Build & stratégies de déploiement

Build : `next build` standard. Deux stratégies documentées par l'équipe :

1. **Poste Windows local (LAN)** — `setup.bat` : installe Node.js LTS + PostgreSQL via winget, crée la base `otp_db`, génère `.env`, `npm install`, push du schéma, build. `start-ordertrack.bat` : démarre PostgreSQL, génère un `JWT_SECRET` aléatoire au premier lancement, tente service Windows puis tâche planifiée, healthcheck `http://localhost:3000/api/health`, affiche l'URL locale + réseau. Usage multi-postes en réseau local (`0.0.0.0`, `allowedDevOrigins`).
2. **Vercel + Neon** — `DEPLOYMENT.md` (guide détaillé pour non-développeurs).

Une coquille **Electron** est prévue (`src/types/electron.d.ts` : `window.electronAPI`, raccourcis, notifications) mais le dossier `electron-app/` **n'est pas versionné** dans ce dépôt — code externe introuvable ici (question ouverte).

## 1.8 Documentation déjà présente dans le dépôt

- `AUDIT_COMPLET.md` (≈ 46 Ko) et `docs/AUDIT-REPRISE.md` (≈ 20 Ko) : audits antérieurs structurés — utiles en référence croisée ; ce présent dossier les **refait et met à jour** (ex. `AUDIT-REPRISE` parlait de « 40 endpoints » ; le code en compte désormais **71 fichiers de routes**).
- `INSTALL-GUIDE.md`, `DEPLOYMENT.md`.
