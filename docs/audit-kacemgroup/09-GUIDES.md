# Phase 10 — Guides (reprise par un nouvel ingénieur)

> Ces guides reflètent l'état **réel** du code audité. Ils complètent —
> sans les remplacer — `INSTALL-GUIDE.md` et `DEPLOYMENT.md` du dépôt.

## 9-A. Installation (poste de développement)

```bash
git clone https://github.com/raedkebaili/suivie-de-commande-kacemgroup.git
cd suivie-de-commande-kacemgroup
npm install                       # Node.js ≥ 18 requis
cp .env.example .env              # éditer : DATABASE_URL, JWT_SECRET (≥32 chars)
# PostgreSQL local : créer la base (ex. otp_db), puis :
npx drizzle-kit push              # crée les 31 tables
npx next dev                      # http://localhost:3000
curl http://localhost:3000/api/health   # déclenche les seeds (admin…)
```

Connexion initiale : `admin / mot de passe initial configuré hors dépôt` — **à changer immédiatement**
(onglet Utilisateurs). Vérifications rapides : `npm run typecheck`, `npm run lint`.

## 9-B. Configuration (toutes les variables réellement lues)

| Variable | Obligatoire | Défaut si absente | Effet |
|---|---|---|---|
| `DATABASE_URL` | oui (à l'usage) | — | connexion PG ; SSL auto si `sslmode=require`/Neon/Supabase |
| `JWT_SECRET` | **oui en pratique** | ⚠️ secret codé en dur | signature des tokens |
| `APP_ENCRYPTION_KEY` | recommandé (64 hex) | dérivé de `JWT_SECRET` | chiffrement secrets Drive |
| `NEXT_PUBLIC_APP_URL` | optionnel | — | liens absolus |
| `DB_POOL_MAX` | optionnel | 20 | pool PG |
| `BACKUP_SECRET` | optionnel | — | autorise cron → `/api/backup/auto` |
| `NEXT_ALLOWED_DEV_ORIGINS` | optionnel | — | origines HMR dev |

Générer : `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

## 9-C. Déploiement

- **Windows/LAN (historique)** : `setup.bat` puis `start-ordertrack.bat`
  (détails : `08-BUILD-DEPLOIEMENT.md`, §9.2-A).
- **Vercel + Neon** : suivre `DEPLOYMENT.md` ; penser à définir `JWT_SECRET`
  **et** `APP_ENCRYPTION_KEY` (sinon le chiffrement Drive dérive du JWT —
  fonctionnel mais moins propre).

Check-list post-déploiement : `/api/health` → connexion admin → changer le mot
de passe → activer la sauvegarde (heure + rétention) → connecter le stockage
Drive (onglet Stockage, guide intégré).

## 9-D. Maintenance courante

| Tâche | Comment |
|---|---|
| Évolution schéma | modifier `src/db/schema.ts` → `npx drizzle-kit push` (prévoir backup avant) |
| Sauvegarde manuelle | Onglet Sauvegarde → Exporter (JSON) |
| Restauration | Onglet Sauvegarde → Restaurer (remplace TOUT ; séquences resynchronisées) |
| Journal | Onglet Watchdog (SA) / table `activity_logs` |
| Réinitialisation usine | `POST /api/admin/reset-database` (UI prévue à cet effet) |
| Mise à jour code | `git pull && npm install && npm run build` (+ `drizzle-kit push` si schéma modifié) → redémarrer |
| Suivi dépendances | `npm audit --omit=dev` à chaque livraison ; cas particulier `xlsx` (SEC-5) |

## 9-E. Cartographie « où toucher pour quoi » (anti-erreur)

| Besoin | Fichiers pivots | Piège à éviter |
|---|---|---|
| Règles de production/expédition | `src/lib/production-apply.ts` | garder l'équivalence Production ↔ Planning |
| Numérotation | `src/lib/order-number.ts` | ne jamais contourner le FOR UPDATE |
| Priorités | `src/lib/priority*.ts` | valeurs legacy à conserver lisibles |
| Droits | table `TABS` (page.tsx) **+** contrôles par route | l'UI seule ne protège rien |
| Couleurs/statuts | `app_colors` + seeds `ensure*Colors` | suppression de clés référencées (`color_key`) |
| Stockage | `src/lib/google-drive.ts`, `storage_config` | ne jamais logger/renvoyer les secrets ; ne pas « réparer » `last_error` (sas OAuth) |
| Archive | `archive/*`, `src/lib/archive-constants.ts` | module volontairement isolé (aucune FK vers orders) |
