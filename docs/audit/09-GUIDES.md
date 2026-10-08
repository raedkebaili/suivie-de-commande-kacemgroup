# 09 — Guides (Phase 10)

## Guide d'installation (développement)

Prérequis : Node.js ≥ 20.9 (LTS conseillé), PostgreSQL ≥ 15.

```bash
git clone https://github.com/raedkebaili/suivie-de-commande-kacemgroup.git
cd suivie-de-commande-kacemgroup
cp .env.example .env          # puis éditer DATABASE_URL ; générer JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npm install                   # ⚠ lockfile absent : versions flottantes
npx drizzle-kit push          # crée les 32 tables
npm run dev                   # http://localhost:3000
```

Première connexion : `admin / mot de passe initial configuré hors dépôt` (compte semé par `/api/health` ou
`/api/auth/login`). **Changez ce mot de passe immédiatement**
(onglet Utilisateurs).

## Guide de déploiement

### A. Poste Windows (LAN) — flux officiel
1. Copier le projet sur le poste serveur.
2. Double-cliquer `setup.bat` (droits admin) : Node, PostgreSQL, `.env`
   sécurisé, base créée, schéma poussé, build, service optionnel.
3. Utilisation quotidienne : `start-ordertrack.bat` — les postes clients
   ouvrent `http://<IP-du-poste>:3000`.

### B. Serveur Linux (générique)
```bash
npm install && npm run build
DATABASE_URL=<valeur-hors-depot> JWT_SECRET=<secret-hors-depot> npm run start
```
Derrière un reverse proxy TLS (nginx/caddy) si exposition externe —
et **après** correction des points critiques du rapport 05.

### C. Vercel + Neon (compatible)
Variables `DATABASE_URL` (avec `sslmode=require`), `JWT_SECRET` ;
le build ne requiert pas la base.

## Guide de configuration

| Besoin | Où |
|---|---|
| Connexion BD / pool | `DATABASE_URL`, `DB_POOL_MAX` |
| Secret JWT | `JWT_SECRET` (aucun fallback à conserver) |
| Chiffrement secrets Drive | `APP_ENCRYPTION_KEY` (64 hex) — sinon dérivé de `JWT_SECRET` |
| Stockage Google | onglet **Stockage** (SA) : Client ID/Secret → connexion OAuth |
| Couleurs des statuts/priorités | onglet **Couleurs** (SA) |
| Colonnes visibles du tableau | config globale SA (route `column-visibility`) |
| Sauvegarde auto (heure, rétention) | onglet **Sauvegarde** (SA) → `system_settings.backup_*` |
| Utilisateurs et rôles | onglet **Utilisateurs** (SA) |

## Guide de maintenance

- **Sauvegarde manuelle** : onglet Sauvegarde → exporter (JSON) ;
  conserver hors du poste. **Le fichier contient les hash des comptes.**
- **Restauration** : même onglet → importer un JSON (purge + rechargement,
  transactionnel).
- **Rotation des sauvegardes** : `backup_max_count` (défaut 30).
- **RAZ complète** : onglet Sauvegarde/zone dangereuse — tapez
  `REINITIALISER` + mot de passe admin.
- **Surveillance** : onglet Watchdog (journal d'activité) ; logs serveur
  console ; `/api/health`.
- **Mises à jour** : git pull → `npm install` → `npx drizzle-kit push` →
  `npm run build` → redémarrage du service. Sans lockfile, **tester après
  chaque mise à jour de dépendances**.

## Dépannage (messages réels de l'application)

| Symptôme | Cause / remède |
|---|---|
| « La base de données n'a pas encore de schéma » (42P01) | exécuter `npx drizzle-kit push` |
| « Impossible de se connecter à PostgreSQL » | service PG arrêté / mauvais `DATABASE_URL` |
| Build OK mais API 500 au premier appel | `DATABASE_URL` absente de l'environnement de démarrage |
| Stockage « non configuré / expiré » | reconnecter Google (onglet Stockage) — refresh token révoqué |
| Commande « Verrouillé par X » | autre édition en cours (< 5 min) — réessayer |
| Planning déjà planifié | unicité jour + article + usine |
