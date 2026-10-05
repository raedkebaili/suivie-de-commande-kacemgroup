# Phase 9 — Build & déploiement

## 9.1 Processus de build

```
npm install            # ⚠️ sans lockfile : versions ^ flottantes
# schéma DB (pas de migrations versionnées) :
npx drizzle-kit push   # applique src/db/schema.ts à DATABASE_URL (config .ts)
npm run build          # next build (connexion DB NON requise grâce au Proxy lazy)
npm run start          # next start (port 3000 par défaut)
```

Points notables :
- Le build peut réussir sans `DATABASE_URL` (connexion paresseuse) ;
  `drizzle.config.ts` exige en revanche la variable pour le push.
- `npm run typecheck` (`tsc --noEmit`) et `npm run lint` disponibles ;
  aucun hook git, aucune CI pour les exécuter.
- Premier démarrage : appeler `GET /api/health` (ou se connecter) pour
  déclencher les seeds (admin, référentiels, couleurs).

## 9.2 Topologies de déploiement documentées par l'équipe

### A. Poste Windows « serveur » de site (LAN) — principal
`setup.bat` (droits admin) : installation winget de **Node.js LTS** et
**PostgreSQL**, création de la base `otp_db`, copie `.env.example → .env`,
`npm install`, push du schéma, build.
`start-ordertrack.bat` : démarre le service PostgreSQL, **génère et persiste un
`JWT_SECRET` aléatoire 96 hex** au premier lancement, tente le service Windows
puis la tâche planifiée, sonde `/api/health` jusqu'à 200, ouvre le navigateur et
affiche `http://localhost:3000` + `http://<IP-LAN>:3000`.
Accès multi-postes : `next` écoute sur toutes interfaces ; `allowedDevOrigins`
contient localhost + IP LAN exemple.

### B. Vercel + Neon — documentée dans `DEPLOYMENT.md`
Procédure guidée : base Neon (SSL), repo GitHub, import Vercel, variable
`DATABASE_URL` (+ `JWT_SECRET`), push du schéma depuis un poste local,
healthcheck. Le mode lazy de `db/index.ts` a été écrit explicitement pour ce cas.

### C. Coquille de bureau Electron — partielle
Types présents (`src/types/electron.d.ts` : preload `window.electronAPI`,
raccourcis onglets, notifications) ; **le dossier `electron-app/` n'est pas
dans le dépôt** → hors périmètre d'audit (question ouverte n°1).

## 9.3 CI/CD, conteneurs, supervision

Aucune GitHub Action / pipeline, aucun Dockerfile/`docker-compose`, aucun
monitoring/APM. Supervision de fait : onglet **Watchdog** (journal applicatif)
+ statut de dernière sauvegarde dans `system_settings`.

## 9.4 Initialisation et cycle de vie de la base

| Étape | Mécanisme |
|---|---|
| Création des tables | `npx drizzle-kit push` (schema-first, **sans migrations SQL versionnées**) |
| Amorçage données | seeds paresseux via `/api/health` (admin, catégories, états, couleurs) |
| Évolution du schéma | re-`push` (attention aux colonnes NOT NULL sans défaut sur base remplie — Drizzle le signale) |
| Remise à zéro | `POST /api/admin/reset-database` (double confirmation, transaction) |

## 9.5 Sauvegardes & restaurations (intégrées à l'application)

| Fonction | Détail |
|---|---|
| Manuelle | Onglet Sauvegarde → `GET /api/backup` : JSON complet téléchargeable |
| Automatique navigateur | `backup-scheduler.ts` : chaque minute, si heure atteinte (`backup_time`), POST `/api/backup/auto`, écrit le fichier dans un dossier local (File System Access, handle en IndexedDB ; repli téléchargement). **Nécessite un navigateur admin ouvert.** |
| Automatique cron | Appel externe avec en-tête `x-backup-secret` (= `BACKUP_SECRET`) |
| Rétention | `backup_max_count` + rotation côté serveur (JSON conservé en `backup_history.backup_data` + téléchargeable via `/api/backup/download/[id]`) |
| Restauration | Onglet Sauvegarde → `POST /api/backup` : transaction, vidage + réinsertion par chunks, **resynchronisation des séquences** (`setval`) sur liste blanche |
| Vérifs | statut dernière exécution en `system_settings.backup_last_status` |

## 9.6 Contrôle de santé

`GET /api/health` → `{ ok: true }` (utilisé par les `.bat` et vérifiable
manuellement). Rappel : il exécute des seeds — ne pas le brancher sur un probe
à haute fréquence sans en être conscient.

## 9.7 Risques du cycle actuel

1. Sans lockfile ni CI, deux machines peuvent construire des applications
   légèrement différentes.
2. Pas de migrations versionnées → l'évolution du schéma repose sur la
   discipline au `push`; pas de rollback automatique.
3. La sauvegarde « automatique » dépend d'un onglet ouvert (sauf cron externe).
4. Pas de probe/monitoring externe documenté pour l'instance cible.
