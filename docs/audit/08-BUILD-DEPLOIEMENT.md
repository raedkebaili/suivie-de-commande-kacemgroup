# 08 — Build & déploiement (Phase 9)

## Processus de build — **vérifié par exécution**

Durant l'audit, le dépôt a été installé et compilé tel quel dans un bac à
sable (`npm install` + `npx next build`) : **« ✓ Compiled successfully »**,
pages statiques générées (`/login` statique, `/` + toutes les API
dynamiques) — donc le projet **build proprement à l'état actuel**, sans
variable `DATABASE_URL` (connexion paresseuse).

```
npm install → next build → .next/ (BUILD_ID) → next start (port 3000)
```

Particularités :
- **Lockfile absent** : chaque installation résout des versions fraîches →
  builds potentiellement non reproductibles.
- Pas de contrainte `engines` Node ; les scripts ciblent **Node LTS**
  (winget) et Next 16 exige Node ≥ 20.9.
- Rapport de routes : `/` dynamique, `/login` statique, 73 API dynamiques.

## Scripts npm
Voir `00-CARTOGRAPHIE.md` (dev / build / start / lint / typecheck).

## Installation Windows automatisée (`setup.bat`)

Séquence vérifiée (8 étapes) : élévation admin → winget requis →
**Node.js LTS** → **PostgreSQL 17** (install unattended, superpassword
`postgres`, port 5432) → `.env` copié depuis `.env.example` avec
**JWT_SECRET aléatoire (48 octets hex)** → lecture de `DATABASE_URL` via
`node -e` → création de la base si absente → `npm install` →
`npx drizzle-kit push` → build → proposition d'installation comme
**service Windows « OrderTrackPro »** → lancement.

`start-ordertrack.bat` : sonde `/api/health` (ne redémarre pas si déjà
actif) → démarre PostgreSQL si arrêté → régénère le JWT si placeholder →
démarre le **service** s'il existe, sinon `next start` (attente active ≤
45 s) → ouvre le navigateur et affiche l'**IP LAN** (`192.168.x.x`) ;
`next.config.ts` autorise les origines HMR LAN. Poste serveur = **point
unique de défaillance** (voir 10).

## Stratégies de déploiement constatées

1. **Windows LAN** (principal, scripts fournis).
2. **Desktop Electron** : shell hors dépôt ; hooks `preload` (raccourcis
   F2/F6…)
3. **Vercel/Neon-compatible** : commentaires explicites (connexion
   paresseuse « ex: Vercel », SSL auto Neon/Supabase) — non démontré.
4. **Docker** : **absent**. **CI/CD** : **absent**.

## Initialisation de la base

`drizzle-kit push` (pas de migrations versionnées). Au premier appel :
`/api/health` (ou login) sème admin + catalogues via seeds idempotents.
Aucune donnée de test fournie.

## Sauvegardes / restaurations

- **Manuelle** : `GET /api/backup` (superadmin) — JSON complet
  téléchargeable + copie archivée en base (`backup_history`).
- **Automatique** : planificateur **navigateur** du superadmin (minuteur
  de 60 s côté client, `backup_time`, File System Access API vers un dossier
  local, fallback téléchargement ; rotation `backup_max_count`).
- **Restauration** : `POST /api/backup` (transaction, purge + reload,
  recalage des séquences, gardes rétrocompatibles).
- **Limites** : aucune sauvegarde si le navigateur admin est fermé ; pas
  de sauvegarde côté serveur (pas de cron) ; le fichier contient des
  données sensibles (voir 05).

## Contrôles de santé

`GET /api/health` → `{ok:true}` après vérification BD + seeds (500 avec
message convivial sinon). Utilisé par les scripts Windows.

## Tableau de conformité

| Élément | État |
|---|---|
| Build reproductible (lockfile) | **Non** |
| Variables d'environnement documentées | Oui (`.env.example`) |
| Migrations versionnées | **Non** (`push`) |
| Conteneurisation | **Non** |
| CI/CD | **Non** |
| Healthcheck HTTP | Oui |
| Procédure de secours documentée | Oui (`DEPLOYMENT.md`, `INSTALL-GUIDE.md` dans le dépôt) |
