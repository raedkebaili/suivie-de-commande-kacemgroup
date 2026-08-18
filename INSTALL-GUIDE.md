# 📦 OrderTrack Pro — Guide d'Installation Complet

## Table des matières

1. [Avant l'installation (machine de BUILD)](#1-avant-linstallation-machine-de-build)
2. [Construire le Setup.exe](#2-construire-le-setupexe)
3. [Sur le serveur cible (PRODUCTION)](#3-sur-le-serveur-cible-production)
4. [Après l'installation](#4-après-linstallation)
5. [Architecture déployée](#5-architecture-déployée)
6. [Dépannage](#6-dépannage)

---

## 1. Avant l'installation (machine de BUILD)

### Prérequis sur la machine de développement

| Composant | Version | Téléchargement |
|-----------|---------|----------------|
| Node.js | 18+ LTS | https://nodejs.org |
| PostgreSQL | 14+ | https://www.postgresql.org |
| Inno Setup | 7.x | https://jrsoftware.org/isinfo.php |
| Git | (optionnel) | https://git-scm.com |

### Étape 1.1 : Récupérer le code source

```powershell
git clone https://github.com/raedkebaili/ORDER-TRACK-FINAL-1.git
cd ORDER-TRACK-FINAL-1
```

### Étape 1.2 : Installer les dépendances

```powershell
npm install
```

### Étape 1.3 : Vérifier la configuration

Le fichier `.env.example` contient la configuration de référence.
Ne PAS le modifier — c'est le modèle copié automatiquement lors de l'installation.

```
.env.example   → Modèle de configuration (COPIÉ en .env par le setup)
.env           → Configuration locale (GÉNÉRÉE automatiquement)
```

### Étape 1.4 : Construire l'application

```powershell
npm run build
```

Vérifier que le dossier `.next` contient un fichier `BUILD_ID` :

```powershell
dir .next\BUILD_ID
```

---

## 2. Construire le Setup.exe

### Étape 2.1 : Compiler l'installeur

```powershell
cd installer
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" ordertrack-setup.iss
```

Ou avec Inno Setup 7 :

```powershell
"C:\Program Files\Inno Setup 7\ISCC.exe" ordertrack-setup.iss
```

### Étape 2.2 : Résultat

Le fichier suivant est créé :

```
dist\OrderTrack-Pro-Setup-1.0.0.exe
```

### Étape 2.3 : Vérification

Le Setup.exe contient :
- ✅ Code source compilé (`.next/`)
- ✅ Fichiers de configuration (`package.json`, `tsconfig.json`, etc.)
- ✅ Scripts d'installation automatique
- ✅ `.env.example` (modèle de configuration)
- ❌ `node_modules/` — installé par `npm install` sur le serveur cible
- ❌ `package-lock.json` — régénéré par `npm install` (inclus si existant)

### Taille attendue

Le Setup.exe pèse environ **15-30 Mo** (compressé LZMA2).

---

## 3. Sur le serveur cible (PRODUCTION)

### Prérequis du serveur

| Composant | Requis | Installé automatiquement |
|-----------|--------|--------------------------|
| Windows 10/11/Server 2019+ | ✅ | — |
| Droits administrateur | ✅ | — |
| Connexion Internet | ✅ (1ère fois) | — |
| winget (App Installer) | ✅ | Fourni par Windows |
| Node.js | ❌ | ✅ Installé par le Setup |
| PostgreSQL | ❌ | ✅ Installé par le Setup |

### Étape 3.1 : Lancer le Setup.exe

1. Copier `OrderTrack-Pro-Setup-1.0.0.exe` sur le serveur
2. **Clic droit** → **Exécuter en tant qu'administrateur**
3. Suivre l'assistant (Suivant → Suivant → Installer)

### Étape 3.2 : Attendre (5-15 minutes)

L'installeur exécute automatiquement :

```
[Automatique] Copie des fichiers
       ↓
[Automatique] Installation Node.js LTS (si absent)
       ↓
[Automatique] Installation PostgreSQL 16 (si absent)
       ↓
[Automatique] Génération .env + clé JWT sécurisée
       ↓
[Automatique] npm install (dépendances)
       ↓
[Automatique] npm run build (si build pré-compilé absent)
       ↓
[Automatique] Création base de données otp_db
       ↓
[Automatique] Application du schéma (tables)
       ↓
[Automatique] Installation service Windows OrderTrackPro
       ↓
[Automatique] Démarrage du serveur
       ↓
[Automatique] Ouverture de http://localhost:3000
```

### Étape 3.3 : Premier accès

Le navigateur s'ouvre automatiquement sur :

```
http://localhost:3000
```

Identifiants par défaut :

```
Compte       : admin
Mot de passe : admin123
```

⚠️ **CHANGEZ LE MOT DE PASSE IMMÉDIATEMENT** depuis l'onglet Utilisateurs.

---

## 4. Après l'installation

### 4.1 Service Windows

Le serveur tourne en **service Windows** nommé `OrderTrackPro` :

```powershell
# Vérifier l'état du service
sc query OrderTrackPro

# Arrêter le serveur
net stop OrderTrackPro

# Redémarrer le serveur
net stop OrderTrackPro && net start OrderTrackPro
```

Le service démarre **automatiquement au boot** du serveur.
Aucune session RDP n'est nécessaire.

### 4.2 Accès multi-utilisateurs RDP

Tous les utilisateurs connectés via Bureau à distance accèdent à :

```
http://localhost:3000
```

Le raccourci "OrderTrack Pro" sur le Bureau ouvre simplement le navigateur.
Le serveur tourne en arrière-plan — indépendant des sessions RDP.

### 4.3 Accès depuis d'autres postes du réseau

Si le serveur a l'IP `192.168.1.100`, les postes clients accèdent via :

```
http://192.168.1.100:3000
```

⚠️ Vérifier que le **pare-feu Windows** autorise le port 3000 :

```powershell
netsh advfirewall firewall add rule name="OrderTrack Pro" dir=in action=allow protocol=TCP localport=3000
```

### 4.4 Sauvegardes

- **Automatiques** : configurables dans l'onglet "Sauvegarde" (défaut : 22h00)
- **Manuelles** : bouton "Télécharger" dans l'onglet "Sauvegarde"
- **Dossier** : `C:\Program Files\OrderTrack Pro\backups\`

### 4.5 Logs

- **Journal applicatif** : onglet "Watchdog" dans l'application
- **Logs serveur** : `C:\Program Files\OrderTrack Pro\logs\`
- **Log d'installation** : `C:\Program Files\OrderTrack Pro\install.log`

### 4.6 Mise à jour

1. Relancer le Setup.exe avec la nouvelle version
2. L'installeur détecte la version précédente
3. Les données et sauvegardes sont conservées
4. Le service est mis à jour automatiquement

### 4.7 Réparation

En cas de problème :

1. Menu Démarrer → "OrderTrack Pro - Réparer"
2. Ou exécuter : `C:\Program Files\OrderTrack Pro\installer\scripts\repair.bat`

Ce script vérifie et répare automatiquement :
- Node.js
- PostgreSQL
- Base de données
- Dépendances npm
- Build de l'application

---

## 5. Architecture déployée

```
C:\Program Files\OrderTrack Pro\
│
├── .env                    ← Configuration (généré automatiquement)
├── .env.example            ← Modèle de référence
├── .next\                  ← Build Next.js compilé
├── src\                    ← Code source
├── node_modules\           ← Dépendances (généré par npm install)
├── backups\                ← Sauvegardes (PRÉSERVÉ en cas de désinstallation)
├── logs\                   ← Journaux du service
├── install.log             ← Journal d'installation
│
├── start-ordertrack.bat    ← Raccourci Bureau (ouvre le navigateur)
├── setup.bat               ← Installation/réparation manuelle
├── service-runner.bat      ← Script exécuté par le service Windows
│
├── installer\
│   └── scripts\
│       ├── install-nodejs.bat     ← Installation Node.js
│       ├── install-postgres.bat   ← Installation PostgreSQL
│       ├── install-service.bat    ← Création service Windows
│       ├── setup-database.bat     ← Création base de données
│       ├── post-install.bat       ← Orchestrateur post-installation
│       ├── repair.bat             ← Réparation automatique
│       └── pre-uninstall.bat      ← Nettoyage avant désinstallation
│
├── package.json
├── tsconfig.json
├── next.config.ts
├── drizzle.config.ts
└── INSTALL-GUIDE.md        ← Ce fichier
```

### Schéma réseau

```
┌──────────────────────────────────────────────────────┐
│              WINDOWS SERVER                           │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ SERVICE: OrderTrackPro (SYSTEM)                  │ │
│  │   └─ npx next start -H 0.0.0.0 -p 3000         │ │
│  │        └─ PostgreSQL (service indépendant)       │ │
│  └──────────────────────┬──────────────────────────┘ │
│                          │ :3000                      │
│  ┌───────────────────────┼─────────────────────────┐ │
│  │ Session RDP: User A   │   → navigateur          │ │
│  │ Session RDP: User B   │   → navigateur          │ │
│  │ Session RDP: User C   │   → navigateur          │ │
│  └───────────────────────┼─────────────────────────┘ │
└──────────────────────────┼───────────────────────────┘
                           │
              ┌────────────┼────────────┐
              │ Postes réseau (LAN)     │
              │ http://IP-SERVER:3000   │
              └─────────────────────────┘
```

---

## 6. Dépannage

### Le serveur ne démarre pas

```powershell
# 1. Vérifier le service
sc query OrderTrackPro

# 2. Vérifier PostgreSQL
sc query postgresql-x64-16

# 3. Vérifier le port
netstat -an | findstr :3000

# 4. Consulter les logs
type "C:\Program Files\OrderTrack Pro\install.log"
type "C:\Program Files\OrderTrack Pro\logs\service-stderr.log"

# 5. Réparer
"C:\Program Files\OrderTrack Pro\installer\scripts\repair.bat"
```

### Erreur "port 3000 déjà utilisé"

```powershell
# Trouver quel processus utilise le port
netstat -ano | findstr :3000

# Arrêter le service existant
net stop OrderTrackPro
taskkill /F /IM node.exe

# Relancer
net start OrderTrackPro
```

### Erreur PostgreSQL "connexion refusée"

```powershell
# Vérifier le service
Get-Service postgresql* | Format-Table Name, Status

# Démarrer PostgreSQL
Start-Service postgresql-x64-16

# Tester la connexion
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -h 127.0.0.1 -U postgres -c "SELECT 1"
```

### Réinstallation complète

```powershell
# 1. Sauvegarder les données (onglet Sauvegarde dans l'app)
# 2. Désinstaller via Programmes et fonctionnalités
# 3. Le dossier backups/ est conservé automatiquement
# 4. Relancer le Setup.exe
# 5. Restaurer la sauvegarde depuis l'onglet Sauvegarde
```

---

*Document généré pour OrderTrack Pro v1.0.0 — KACEM GROUP*
