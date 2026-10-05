# OrderTrack Pro — Kacem Group

Application web interne de suivi du cycle de vie des commandes de Kacem Group :
création commerciale, spécifications techniques, planification, production,
expédition, recouvrement, archivage et sauvegardes.

## Stack et architecture

- **Next.js 16 App Router** + React 19 + TypeScript strict.
- **PostgreSQL** via `pg` et **Drizzle ORM** ; le schéma source est
  `src/db/schema.ts` et le baseline SQL est conservé dans `drizzle/`.
- **API REST** implémentée par les route handlers `src/app/api/**/route.ts`.
- Interface client en composants React sous `src/components/`, montée par
  `src/app/page.tsx`. Les vues sont chargées à la demande par onglet.
- Authentification JWT HS256 avec `jose` : le jeton est stocké dans un cookie
  `HttpOnly` same-origin ; les anciennes intégrations Bearer restent acceptées.
- Intégrations optionnelles : Google Drive pour le stockage documentaire,
  `xlsx` pour les imports/exports Excel, Recharts pour le dashboard.

## Prérequis

- Node.js **20.9 ou supérieur** (requis par Next.js 16.2.6).
- npm.
- PostgreSQL accessible par `DATABASE_URL`.

## Installation locale

```bash
npm ci
cp .env.example .env
# Renseigner DATABASE_URL et générer les secrets requis dans .env.
npx drizzle-kit push
npm run dev
```

L'application est disponible sur <http://localhost:3000>. Le premier appel à
`/api/health` initialise les référentiels par défaut et le compte administrateur
temporaire. Le changement du mot de passe temporaire est obligatoire avant
l'accès aux modules.

Les variables sensibles ne doivent jamais être commitées :
`DATABASE_URL`, `JWT_SECRET`, `APP_ENCRYPTION_KEY` et `BACKUP_SECRET`.
Le modèle complet se trouve dans `.env.example`.

## Commandes de vérification

```bash
npm test             # tests unitaires Vitest
npm run typecheck    # TypeScript strict
npm run lint         # ESLint
npm run build        # build Next.js de production
npm start            # démarrage du build
```

## Organisation métier

| Zone | Responsabilité |
|---|---|
| `src/app/api/auth` | Connexion, session, changement de mot de passe |
| `src/app/api/orders` | Commandes, articles, export, numéro de commande |
| `src/app/api/production` et `expedition` | Lots de production et livraisons |
| `src/app/api/production-planning` | Planning journalier par usine |
| `src/app/api/storage` et `documents` | Google Drive et associations documentaires |
| `src/app/api/backup` | Sauvegarde/restauration et historique |
| `src/db/schema.ts` | Utilisateurs, référentiels, commandes, lots, audit et modules annexes |
| `src/lib/auth.ts` | Hashage, JWT, autorisation, journaux et notifications |
| `src/lib/*` | Règles métier testables et helpers transverses |
| `src/components` | Vues de dashboard, commandes, production et administration |

Les rôles applicatifs sont `superadmin`, `commercial`, `technique`,
`planification`, `consultant_prod` et `recouvrement`. Les routes API vérifient
l'authentification et les rôles côté serveur ; les restrictions d'affichage de
la sidebar ne constituent pas une frontière de sécurité.

## Déploiement

- **Windows/LAN** : `setup.bat` prépare PostgreSQL, la configuration, le
  schéma et le build ; `start-ordertrack.bat` lance l'application.
- **Vercel + Neon** : suivre `DEPLOYMENT.md`, renseigner toutes les variables
  d'environnement et exécuter `npx drizzle-kit push` avant le premier accès.
- **CI et Docker** : aucun workflow GitHub Actions, Dockerfile ou
  `docker-compose.yml` n'est présent dans ce dépôt à ce jour.

## Documentation complémentaire

- `DEPLOYMENT.md` : déploiement Vercel + Neon.
- `INSTALL-GUIDE.md` : installation Windows et réseau local.
- `AUDIT_COMPLET.md` : audit historique détaillé.
- `docs/AUDIT-REPRISE.md` et `docs/audit/` : audits et correctifs historiques.
