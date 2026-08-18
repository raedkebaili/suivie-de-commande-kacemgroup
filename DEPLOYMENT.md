# 🚀 Guide de Déploiement — OrderTrack Pro sur Vercel + Neon

Ce guide vous accompagne pas à pas pour déployer OrderTrack Pro en ligne.
À la fin, vous aurez un lien HTTPS public accessible par tous vos utilisateurs.

**Durée estimée : 15 à 20 minutes.**

**Aucune carte bancaire n'est requise.**

---

## Table des matières

1. [Prérequis](#1-prérequis)
2. [Étape 1 — Créer la base de données Neon](#2-étape-1--créer-la-base-de-données-neon)
3. [Étape 2 — Préparer le code sur GitHub](#3-étape-2--préparer-le-code-sur-github)
4. [Étape 3 — Déployer sur Vercel](#4-étape-3--déployer-sur-vercel)
5. [Étape 4 — Créer les tables dans la base](#5-étape-4--créer-les-tables-dans-la-base)
6. [Étape 5 — Vérifier que tout fonctionne](#6-étape-5--vérifier-que-tout-fonctionne)
7. [Mettre à jour l'application](#7-mettre-à-jour-lapplication)
8. [Dépannage](#8-dépannage)
9. [Limites du plan gratuit](#9-limites-du-plan-gratuit)

---

## 1. Prérequis

Sur votre ordinateur, vous avez besoin de :

| Outil | Pourquoi | Vérifier |
|-------|----------|----------|
| **Node.js 18+** | Pour exécuter les migrations | `node --version` |
| **npm** | Pour installer les dépendances | `npm --version` |
| **Git** | Pour pousser le code sur GitHub | `git --version` |

Si Node.js n'est pas installé :

```bash
# Windows (PowerShell administrateur)
winget install OpenJS.NodeJS.LTS

# macOS
brew install node

# Linux
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
```

---

## 2. Étape 1 — Créer la base de données Neon

Neon fournit une base PostgreSQL gratuite en ligne (500 Mo, sans carte bancaire).

### 2.1 Créer un compte

1. Allez sur **https://neon.tech**
2. Cliquez **Sign Up**
3. Connectez-vous avec votre compte **GitHub** (recommandé) ou par email

### 2.2 Créer un projet

1. Cliquez **Create a project**
2. Remplissez :
   - **Project name** : `ordertrack-pro`
   - **Database name** : `otp_db`
   - **Region** : choisissez le plus proche de vos utilisateurs (ex: `Europe (Frankfurt)`)
3. Cliquez **Create project**

### 2.3 Copier l'URL de connexion

Après la création, Neon affiche une page avec l'URL de connexion.

1. Dans la section **Connection string**, cliquez sur l'icône de copie
2. L'URL ressemble à ceci :

```
postgresql://neondb_owner:AbCdEf123456@ep-xyz-abc-123456.eu-central-1.aws.neon.tech/otp_db?sslmode=require
```

3. **GARDEZ CETTE URL** — vous en aurez besoin à l'étape 3

> ⚠️ Ne partagez jamais cette URL. Elle contient le mot de passe de votre base.

---

## 3. Étape 2 — Préparer le code sur GitHub

### 3.1 Si le dépôt existe déjà sur GitHub

Si vous avez déjà un fork du projet sur GitHub, clonez-le :

```bash
git clone https://github.com/VOTRE_UTILISATEUR/ORDER-TRACK-FINAL-1.git
cd ORDER-TRACK-FINAL-1
```

### 3.2 Si vous partez du code source

```bash
# Cloner le dépôt original
git clone https://github.com/raedkebaili/ORDER-TRACK-FINAL-1.git
cd ORDER-TRACK-FINAL-1

# Créer votre propre dépôt sur GitHub (via https://github.com/new)
# Puis connectez-le :
git remote set-url origin https://github.com/VOTRE_UTILISATEUR/ordertrack-pro.git
git push -u origin main
```

### 3.3 Vérifier que le .gitignore est en place

```bash
cat .gitignore
```

Vous devez voir `node_modules/`, `.next/`, `.env`, etc.
Si le fichier n'existe pas, créez-le (il est inclus dans le projet).

### 3.4 Pousser le code

```bash
git add -A
git commit -m "Prêt pour le déploiement Vercel"
git push
```

---

## 4. Étape 3 — Déployer sur Vercel

### 4.1 Créer un compte Vercel

1. Allez sur **https://vercel.com**
2. Cliquez **Sign Up**
3. Choisissez **Continue with GitHub**
4. Autorisez l'accès à vos dépôts

### 4.2 Importer le projet

1. Sur le dashboard Vercel, cliquez **Add New → Project**
2. Cherchez votre dépôt `ordertrack-pro` (ou `ORDER-TRACK-FINAL-1`)
3. Cliquez **Import**

### 4.3 Configurer les variables d'environnement

C'est l'étape la plus importante. Sur l'écran de configuration du projet :

1. Cliquez sur **Environment Variables**
2. Ajoutez les variables suivantes **une par une** :

| Name | Value |
|------|-------|
| `DATABASE_URL` | *(collez l'URL Neon copiée à l'étape 2.3)* |
| `JWT_SECRET` | *(voir ci-dessous pour générer)* |

**Pour générer le JWT_SECRET**, ouvrez un terminal et exécutez :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copiez la chaîne de 96 caractères affichée et collez-la comme valeur de `JWT_SECRET`.

**Exemple** (ne pas utiliser cette valeur, générez la vôtre) :
```
a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
```

### 4.4 Lancer le déploiement

1. Laissez les autres paramètres par défaut (Vercel détecte Next.js automatiquement)
2. **Framework Preset** : Next.js (détecté automatiquement)
3. **Build Command** : `npm run build` (par défaut)
4. **Output Directory** : `.next` (par défaut)
5. Cliquez **Deploy**

### 4.5 Attendre le build

Le build prend environ 1 à 3 minutes. Vous verrez les logs en temps réel.

Si le build réussit, Vercel affiche :

```
✅ Production deployed
```

Et un lien comme :

```
https://ordertrack-pro-xxxxx.vercel.app
```

> ⚠️ Ne visitez pas encore le lien — il faut d'abord créer les tables dans la base (étape 4).

---

## 5. Étape 4 — Créer les tables dans la base

Les tables PostgreSQL doivent être créées une seule fois. Cela se fait depuis votre ordinateur.

### 5.1 Installer les dépendances localement

```bash
cd ORDER-TRACK-FINAL-1   # ou le dossier de votre projet
npm install
```

### 5.2 Configurer la connexion locale vers Neon

Créez un fichier `.env` à la racine du projet avec l'URL Neon :

```bash
# Windows (PowerShell)
echo 'DATABASE_URL=postgresql://neondb_owner:VOTRE_MOT_DE_PASSE@ep-xyz.neon.tech/otp_db?sslmode=require' > .env

# macOS / Linux
echo 'DATABASE_URL=postgresql://neondb_owner:VOTRE_MOT_DE_PASSE@ep-xyz.neon.tech/otp_db?sslmode=require' > .env
```

> Remplacez l'URL par la vraie URL Neon copiée à l'étape 2.3.

### 5.3 Appliquer le schéma

```bash
npx drizzle-kit push
```

Vous devriez voir :

```
[✓] Changes applied
```

Cela crée toutes les tables : `users`, `orders`, `order_items`, `clients`, `agencies`, etc.

### 5.4 Vérifier que les tables existent

```bash
# Optionnel : vérifier avec psql (si installé)
psql "VOTRE_URL_NEON" -c "\dt"
```

Ou simplement ouvrez la console Neon dans votre navigateur :
1. Allez sur https://console.neon.tech
2. Sélectionnez votre projet
3. Cliquez **SQL Editor**
4. Exécutez : `SELECT tablename FROM pg_tables WHERE schemaname = 'public';`

---

## 6. Étape 5 — Vérifier que tout fonctionne

### 6.1 Ouvrir l'application

Ouvrez le lien Vercel dans votre navigateur :

```
https://votre-projet.vercel.app
```

### 6.2 Se connecter

L'écran de connexion s'affiche. Utilisez les identifiants par défaut :

```
Identifiant : admin
Mot de passe : admin123
```

> ⚠️ **CHANGEZ IMMÉDIATEMENT le mot de passe** après la première connexion
> (Menu → Utilisateurs → Modifier l'admin).

### 6.3 Tester les fonctionnalités

| Test | Résultat attendu |
|------|------------------|
| Créer un client | ✅ Enregistré en base Neon |
| Créer une agence | ✅ Enregistré |
| Créer une commande | ✅ Numéro auto-généré |
| Ouvrir dans un autre navigateur | ✅ Mêmes données visibles |
| Actualiser la page | ✅ Données persistantes |

### 6.4 Vérifier le healthcheck

Dans votre navigateur, ouvrez :

```
https://votre-projet.vercel.app/api/health
```

Réponse attendue :

```json
{"ok":true}
```

---

## 7. Mettre à jour l'application

Chaque fois que vous modifiez le code et poussez sur GitHub, Vercel redéploie automatiquement.

```bash
# 1. Faire vos modifications
# 2. Commiter
git add -A
git commit -m "Description de la mise à jour"

# 3. Pousser
git push

# 4. Vercel redéploie automatiquement (1-3 minutes)
```

### Mettre à jour le schéma de la base

Si vous avez modifié `src/db/schema.ts` (ajout de colonnes, nouvelles tables) :

```bash
# Depuis votre machine locale, avec le .env configuré vers Neon
npx drizzle-kit push
```

---

## 8. Dépannage

### Le build échoue sur Vercel

**Erreur : `DATABASE_URL is not set`**

→ La variable d'environnement n'est pas configurée dans Vercel.
1. Allez dans Vercel → Settings → Environment Variables
2. Vérifiez que `DATABASE_URL` est bien défini
3. Cliquez **Redeploy** (menu ⋯ du dernier déploiement)

**Erreur : `Module not found`**

→ Les dépendances ne sont pas installées.
```bash
# Localement, vérifiez :
npm install
npm run build
# Si ça passe localement, poussez à nouveau :
git add -A && git commit -m "fix deps" && git push
```

### L'application affiche une erreur 500

**Vérifier les logs Vercel :**
1. Allez dans Vercel → votre projet → **Deployments**
2. Cliquez sur le dernier déploiement
3. Onglet **Functions** → cliquez sur une route → **Logs**

**Causes fréquentes :**
- `DATABASE_URL` incorrecte → vérifiez l'URL Neon
- Tables non créées → exécutez `npx drizzle-kit push`
- SSL → l'URL doit contenir `?sslmode=require`

### La page de connexion s'affiche mais le login échoue

→ Les tables sont vides. Le premier appel à `/api/health` crée l'utilisateur admin.

Ouvrez dans votre navigateur :
```
https://votre-projet.vercel.app/api/health
```

Puis retournez à la page de connexion et réessayez.

### Comment voir les données dans Neon ?

1. Allez sur https://console.neon.tech
2. Sélectionnez votre projet
3. Cliquez **Tables** dans le menu de gauche
4. Parcourez les tables visuellement

Ou utilisez le SQL Editor :
```sql
SELECT * FROM users;
SELECT * FROM orders;
SELECT count(*) FROM order_items;
```

---

## 9. Limites du plan gratuit

### Vercel (hébergement)

| Ressource | Limite gratuite | Suffisant pour |
|-----------|----------------|----------------|
| Bande passante | 100 Go/mois | ~50 utilisateurs quotidiens |
| Builds | 6 000 min/mois | ~200 déploiements |
| Fonctions serverless | 10 secondes timeout | Toutes les API de l'app |
| Domaine | sous-domaine `.vercel.app` | Accès HTTPS direct |

### Neon (base de données)

| Ressource | Limite gratuite | Suffisant pour |
|-----------|----------------|----------------|
| Stockage | 500 Mo | ~10 000 commandes |
| Compute | 190 heures/mois | Usage bureau normal |
| Branches | 10 | 1 suffit pour la prod |
| Projets | 1 | 1 suffit |

### Quand passer au payant ?

Vous n'aurez besoin de payer que si :
- Plus de 100 Go de trafic par mois (très rare pour un ERP interne)
- Plus de 500 Mo de données (milliers de commandes avec pièces jointes)
- Besoin d'un domaine personnalisé (ex: `app.votreentreprise.com`)

---

## Récapitulatif des commandes

```bash
# ── 1. Cloner le projet ──
git clone https://github.com/VOTRE_UTILISATEUR/ordertrack-pro.git
cd ordertrack-pro

# ── 2. Installer les dépendances ──
npm install

# ── 3. Configurer le .env local (pour les migrations) ──
echo 'DATABASE_URL=postgresql://user:pass@host.neon.tech/otp_db?sslmode=require' > .env

# ── 4. Générer un JWT_SECRET ──
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# → Copiez ce résultat dans les variables d'environnement Vercel

# ── 5. Appliquer le schéma de la base ──
npx drizzle-kit push

# ── 6. Vérifier le build localement (optionnel) ──
npm run build

# ── 7. Pousser sur GitHub (déclenche le déploiement Vercel) ──
git add -A
git commit -m "Déploiement production"
git push

# ── 8. Ouvrir l'application ──
# → https://votre-projet.vercel.app
# → Compte : admin / admin123
```

---

## Architecture finale

```
┌─────────────────────────────────────────────────────────┐
│  Utilisateurs (navigateur, smartphone, tablette)        │
│  https://votre-projet.vercel.app                        │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────┐
│  Vercel (gratuit)                                        │
│  ├── Pages statiques (React)                             │
│  └── API Routes serverless (/api/*)                      │
└──────────────────────┬──────────────────────────────────┘
                       │ SSL (sslmode=require)
┌──────────────────────▼──────────────────────────────────┐
│  Neon PostgreSQL (gratuit)                               │
│  ├── Base : otp_db                                       │
│  ├── 20+ tables (users, orders, clients, ...)            │
│  └── 500 Mo stockage                                     │
└─────────────────────────────────────────────────────────┘
```

---

*Guide généré pour OrderTrack Pro v1.0.0 — KACEM GROUP*
