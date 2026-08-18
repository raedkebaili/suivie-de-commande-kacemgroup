# 📋 AUDIT TECHNIQUE COMPLET - OrderTrack Pro

**Application:** OrderTrack Pro - Gestionnaire de Commandes KACEM GROUP  
**Date d'audit:** Juillet 2026  
**Version:** 1.0  
**URL de prévisualisation:** https://3000-iu6nc8289zusmx8yoo81v.e2b.app

---

## 📌 TABLE DES MATIÈRES

1. [Vue d'ensemble de l'architecture](#1-vue-densemble-de-larchitecture)
2. [Technologies et dépendances](#2-technologies-et-dépendances)
3. [Structure du projet](#3-structure-du-projet)
4. [Base de données - Schéma relationnel](#4-base-de-données---schéma-relationnel)
5. [Documentation des API](#5-documentation-des-api)
6. [Logique métier](#6-logique-métier)
7. [Système d'authentification et sécurité](#7-système-dauthentification-et-sécurité)
8. [Composants Frontend](#8-composants-frontend)
9. [Audit de performances](#9-audit-de-performances)
10. [Audit de sécurité](#10-audit-de-sécurité)
11. [Audit de qualité du code](#11-audit-de-qualité-du-code)
12. [Dette technique identifiée](#12-dette-technique-identifiée)
13. [Opportunités d'amélioration](#13-opportunités-damélioration)
14. [Guide d'installation](#14-guide-dinstallation)
15. [Guide de maintenance](#15-guide-de-maintenance)

---

## 1. VUE D'ENSEMBLE DE L'ARCHITECTURE

### 1.1 Description de l'application

**OrderTrack Pro** est une application de gestion de commandes complète destinée au groupe KACEM. Elle permet :

- La gestion du cycle de vie complet des commandes (création → production → expédition → livraison)
- La gestion des clients et des agences
- Le suivi de production par lots
- Le suivi des expéditions
- La gestion des matières et composants techniques
- Un système de notifications en temps réel
- Un tableau de bord analytique avec graphiques
- Un système de sauvegarde/restauration complet
- Un journal d'activité (watchdog)

### 1.2 Architecture technique

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ARCHITECTURE GLOBALE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    FRONTEND (React 19)                        │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │  │
│  │  │ Page Login  │ │  Page Home  │ │ Composants: Dashboard,  │ │  │
│  │  │             │ │  (Sidebar)  │ │ Orders, Production,     │ │  │
│  │  │             │ │             │ │ Expedition, Users, etc. │ │  │
│  │  └─────────────┘ └─────────────┘ └─────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼ API Fetch (JWT Bearer)               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   BACKEND (Next.js 16 App Router)             │  │
│  │  ┌──────────────────────────────────────────────────────────┐│  │
│  │  │               Route Handlers (/api/*)                    ││  │
│  │  │  - /api/auth/*       - /api/orders/*                     ││  │
│  │  │  - /api/users/*      - /api/production                   ││  │
│  │  │  - /api/clients/*    - /api/expedition/*                 ││  │
│  │  │  - /api/agencies/*   - /api/matieres                     ││  │
│  │  │  - /api/dashboard    - /api/backup                       ││  │
│  │  │  - /api/notifications/*                                   ││  │
│  │  └──────────────────────────────────────────────────────────┘│  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼ Drizzle ORM                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     PostgreSQL Database                       │  │
│  │  Tables: users, agencies, clients, orders, order_items,      │  │
│  │  production_batches, expedition_batches, matieres,           │  │
│  │  material_categories, notifications, activity_logs, etc.     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 Flux de données

```
Utilisateur → Composant React → apiFetch() → Route API → Drizzle ORM → PostgreSQL
                    ↑                                         │
                    └─────── JSON Response ───────────────────┘
```

---

## 2. TECHNOLOGIES ET DÉPENDANCES

### 2.1 Stack principal

| Technologie | Version | Usage |
|-------------|---------|-------|
| **Next.js** | 16.2.6 | Framework fullstack (App Router) |
| **React** | 19.2.6 | UI Library |
| **TypeScript** | 5.9.3 | Typage statique |
| **PostgreSQL** | - | Base de données |
| **Drizzle ORM** | 0.45.2 | ORM pour PostgreSQL |
| **Tailwind CSS** | 4.1.17 | Framework CSS |
| **Node.js** | ES2017+ | Runtime |

### 2.2 Dépendances de production

| Package | Version | Usage |
|---------|---------|-------|
| `bcryptjs` | 3.0.3 | Hashage des mots de passe |
| `jose` | 6.2.3 | JWT tokens (signature/vérification) |
| `recharts` | 3.9.2 | Graphiques du dashboard |
| `xlsx` | 0.18.5 | Import/Export Excel |
| `pg` | 8.20.0 | Driver PostgreSQL |
| `dotenv` | 17.3.1 | Variables d'environnement |

### 2.3 Dépendances de développement

| Package | Version | Usage |
|---------|---------|-------|
| `drizzle-kit` | 0.31.10 | Gestion du schéma DB |
| `eslint` | 9.39.4 | Linting |
| `postcss` | 8.5.8 | Traitement CSS |

### 2.4 Variables d'environnement

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `DATABASE_URL` | ✅ | URL de connexion PostgreSQL |
| `JWT_SECRET` | ✅ | Clé secrète pour signer les JWT |
| `NEXT_PUBLIC_APP_URL` | ❌ | URL publique de l'application |
| `DB_POOL_MAX` | ❌ | Taille max du pool de connexions (défaut: 20) |

---

## 3. STRUCTURE DU PROJET

```
src/
├── app/                          # App Router Next.js
│   ├── layout.tsx                # Layout racine avec AuthProvider
│   ├── page.tsx                  # Page principale (Dashboard/Commandes)
│   ├── globals.css               # Styles globaux Tailwind + custom
│   ├── login/
│   │   └── page.tsx              # Page de connexion
│   └── api/                      # Route Handlers API
│       ├── auth/
│       │   ├── login/route.ts    # POST login
│       │   ├── logout/route.ts   # POST logout
│       │   └── me/route.ts       # GET utilisateur courant
│       ├── users/
│       │   ├── route.ts          # GET/POST users
│       │   └── [id]/route.ts     # GET/PUT/DELETE user by id
│       ├── orders/
│       │   ├── route.ts          # GET/POST orders
│       │   ├── [id]/route.ts     # GET/PUT/DELETE order by id
│       │   ├── export/route.ts   # GET export Excel
│       │   └── next-number/route.ts # GET prochain numéro
│       ├── clients/
│       │   ├── route.ts          # CRUD clients
│       │   └── [id]/route.ts
│       ├── agencies/
│       │   ├── route.ts          # CRUD agences
│       │   └── [id]/route.ts
│       ├── production/route.ts   # GET/POST production batches
│       ├── expedition/
│       │   ├── route.ts          # GET/POST expedition batches
│       │   └── [itemId]/route.ts # GET historique par article
│       ├── matieres/route.ts     # CRUD matières
│       ├── material-categories/route.ts # GET/POST catégories
│       ├── notifications/
│       │   ├── route.ts          # GET notifications
│       │   └── [id]/route.ts     # PUT marquer lu
│       ├── dashboard/route.ts    # GET statistiques
│       ├── backup/route.ts       # GET export / POST restore
│       ├── import/route.ts       # POST import Excel
│       ├── search/route.ts       # GET recherche globale
│       ├── activity/route.ts     # GET journal d'activité
│       └── health/route.ts       # GET healthcheck
│
├── components/                   # Composants React
│   ├── Sidebar.tsx               # Navigation latérale
│   ├── DashboardView.tsx         # Tableau de bord avec graphiques
│   ├── OrdersView.tsx            # Gestion des commandes (380 lignes)
│   ├── ProductionView.tsx        # Saisie de production
│   ├── ExpeditionView.tsx        # Saisie d'expédition
│   ├── MatiereView.tsx           # Gestion des matières
│   ├── ClientsView.tsx           # Gestion des clients
│   ├── AgenciesView.tsx          # Gestion des agences
│   ├── UsersView.tsx             # Gestion des utilisateurs
│   ├── WatchdogView.tsx          # Journal d'activité
│   ├── BackupView.tsx            # Sauvegarde/Restauration
│   └── AutocompleteInput.tsx     # Input avec autocomplétion
│
├── db/
│   ├── index.ts                  # Configuration Drizzle + Pool
│   └── schema.ts                 # Définition des tables (16 tables)
│
├── lib/
│   ├── api.ts                    # Client API (apiFetch, token management)
│   ├── api-helpers.ts            # Helpers pour auth côté serveur
│   ├── auth.ts                   # JWT, bcrypt, logging, notifications
│   ├── auth-context.tsx          # Context React pour l'auth
│   ├── types.ts                  # Types TypeScript (User, Order, etc.)
│   ├── order-visual-state.ts     # États visuels des commandes
│   ├── material-categories.ts    # Catégories de matières par défaut
│   ├── db-error.ts               # Messages d'erreur PostgreSQL
│   ├── excel.ts                  # Utilitaires Excel
│   └── tech-categories.ts        # Catégories techniques
│
└── types/
    └── electron.d.ts             # Types pour Electron (optionnel)
```

---

## 4. BASE DE DONNÉES - SCHÉMA RELATIONNEL

### 4.1 Diagramme ER (Entity-Relationship)

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│      USERS       │       │     AGENCIES     │       │     CLIENTS      │
├──────────────────┤       ├──────────────────┤       ├──────────────────┤
│ id (PK)          │       │ id (PK)          │       │ id (PK)          │
│ username (UQ)    │       │ name (UQ)        │       │ name (UQ)        │
│ passwordHash     │       │ code (UQ)        │       │ code (UQ)        │
│ role             │       │ address          │       │ contactName      │
│ fullName         │       │ active           │       │ phone, email     │
│ active           │       │ createdAt        │       │ address, active  │
│ darkMode         │       └────────┬─────────┘       └────────┬─────────┘
│ createdAt        │                │                          │
└────────┬─────────┘                │                          │
         │                          │                          │
         │         ┌────────────────┴──────────────────────────┴───────┐
         │         │                                                   │
         ▼         ▼                                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              ORDERS                                      │
├─────────────────────────────────────────────────────────────────────────┤
│ id (PK)              │ orderNumber (UQ)     │ orderDate                  │
│ priority             │ status               │ productionStatus           │
│ clientId (FK)        │ agencyId (FK)        │ affaire                    │
│ createdBy (FK→users) │ createdByName        │ lockedBy, lockedByName     │
│ techCompleted        │ planifCompleted      │ cancelReason, cancelledAt  │
│ createdAt            │ updatedAt            │ updatedBy                  │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ 1:N
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            ORDER_ITEMS                                   │
├─────────────────────────────────────────────────────────────────────────┤
│ id (PK)              │ orderId (FK)         │ articleName                │
│ quantity             │ producedQty          │ deliveredQty               │
│ note                 │ clientSpec           │ productionUnit             │
│ plannedLoadingDate   │ deliveryDate         │ unitPrice                  │
│ pcb, pcbBy, pcbAt    │ colorTemperature,... │ driver, lens,...           │
│ description          │                      │                            │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
┌────────────────────┐  ┌────────────────────┐  ┌─────────────────────────┐
│ PRODUCTION_BATCHES │  │ EXPEDITION_BATCHES │  │ ITEM_TECHNICAL_COMPON.  │
├────────────────────┤  ├────────────────────┤  ├─────────────────────────┤
│ id (PK)            │  │ id (PK)            │  │ id (PK)                 │
│ itemId (FK)        │  │ itemId (FK)        │  │ itemId (FK)             │
│ orderId (FK)       │  │ orderId (FK)       │  │ orderId (FK)            │
│ quantity           │  │ quantity           │  │ categoryId (FK)         │
│ cumulativeTotal    │  │ cumulativeTotal    │  │ materialId (FK)         │
│ producedBy         │  │ driverName         │  │ categoryKey/Name        │
│ productionDate     │  │ deliveredBy        │  │ materialReference/Label │
│ createdAt          │  │ deliveryDate       │  │ isTelegestion           │
└────────────────────┘  │ note               │  │ enteredBy/At            │
                        │ createdAt          │  └─────────────────────────┘
                        └────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐  ┌────────────────────┐
│  MATERIAL_CATEGORIES │  │       MATIERES       │  │   NOTIFICATIONS    │
├──────────────────────┤  ├──────────────────────┤  ├────────────────────┤
│ id (PK)              │  │ id (PK)              │  │ id (PK)            │
│ key (UQ)             │  │ categoryId (FK)      │  │ userId (FK)        │
│ name (UQ)            │  │ category             │  │ type, title        │
│ isTelegestion        │  │ reference            │  │ message            │
│ active               │  │ name                 │  │ orderId (FK)       │
│ sortOrder            │  │ stock                │  │ read               │
│ createdAt            │  │ specs, active        │  │ createdAt          │
└──────────────────────┘  │ updatedAt            │  └────────────────────┘
                          └──────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐  ┌────────────────────┐
│    ACTIVITY_LOGS     │  │  MODIFICATION_LOGS   │  │ PRODUCTION_UNIT_LIB│
├──────────────────────┤  ├──────────────────────┤  ├────────────────────┤
│ id (PK)              │  │ id (PK)              │  │ id (PK)            │
│ userId (FK)          │  │ orderId (FK)         │  │ name (UQ)          │
│ username             │  │ userId (FK)          │  │ usageCount         │
│ action               │  │ username             │  └────────────────────┘
│ details              │  │ field                │
│ createdAt            │  │ oldValue, newValue   │  ┌────────────────────┐
└──────────────────────┘  │ createdAt            │  │  ARTICLE_LIBRARY   │
                          └──────────────────────┘  ├────────────────────┤
                                                    │ id (PK)            │
┌──────────────────────┐                            │ name (UQ)          │
│     TECH_LIBRARY     │                            │ description        │
├──────────────────────┤                            │ usageCount         │
│ id (PK)              │                            └────────────────────┘
│ category             │
│ value                │
│ usageCount           │
└──────────────────────┘
```

### 4.2 Description détaillée des tables

#### 4.2.1 Table `users`
**Rôle:** Stocke les utilisateurs de l'application avec leurs rôles et préférences.

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | SERIAL | PK | Identifiant unique |
| username | TEXT | NOT NULL, UNIQUE | Nom d'utilisateur de connexion |
| passwordHash | TEXT | NOT NULL | Hash bcrypt du mot de passe |
| role | TEXT | NOT NULL, DEFAULT 'commercial' | Rôle (superadmin, commercial, technique, planification, consultant_prod) |
| fullName | TEXT | NOT NULL | Nom complet affiché |
| active | BOOLEAN | NOT NULL, DEFAULT true | Compte actif/désactivé |
| darkMode | BOOLEAN | NOT NULL, DEFAULT false | Préférence mode sombre |
| createdAt | TIMESTAMP | NOT NULL, DEFAULT NOW | Date de création |

#### 4.2.2 Table `orders`
**Rôle:** Table principale des commandes. Contient les informations d'en-tête et le statut de production.

| Colonne | Type | Description |
|---------|------|-------------|
| id | SERIAL | PK |
| orderNumber | TEXT | Numéro unique de commande (ex: "12-2026") |
| orderDate | TEXT | Date de la commande |
| priority | TEXT | PREVISION, NORMALE, URGENTE, TRES_URGENTE |
| clientId | INTEGER | FK vers clients |
| agencyId | INTEGER | FK vers agencies |
| status | TEXT | État commercial: SUR_STOCK, BON_COMMANDE, PREVISION |
| productionStatus | TEXT | État production: EN_INSTANCE, EN_PRODUCTION, LIVREE, ANNULEE |
| affaire | TEXT | Référence d'affaire |
| createdBy | INTEGER | FK vers users (créateur) |
| lockedBy | INTEGER | Verrouillage concurrent |
| techCompleted | BOOLEAN | Spécifications techniques complétées |
| planifCompleted | BOOLEAN | Planification complétée |

#### 4.2.3 Table `order_items`
**Rôle:** Articles de chaque commande avec leurs spécifications techniques et suivi de production/livraison.

| Champs clés | Description |
|-------------|-------------|
| articleName | Nom de l'article |
| quantity | Quantité commandée |
| producedQty | Quantité produite (cumul) |
| deliveredQty | Quantité livrée (cumul) |
| pcb, colorTemperature, lens, driver, electricalClass, accessories | Spécifications techniques |
| *By, *At | Traçabilité (qui a renseigné, quand) |

#### 4.2.4 Table `production_batches`
**Rôle:** Historique des lots de production. Chaque saisie de production crée une entrée.

#### 4.2.5 Table `expedition_batches`
**Rôle:** Historique des expéditions. Chaque saisie d'expédition crée une entrée avec chauffeur, date, note.

#### 4.2.6 Table `matieres`
**Rôle:** Catalogue de matières/composants techniques. Organisé par catégories.

#### 4.2.7 Table `material_categories`
**Rôle:** Catégories de matières (PCB, Driver, Lentille, etc.). Certaines sont pour la télégestion.

#### 4.2.8 Table `notifications`
**Rôle:** Notifications utilisateur (création de commande, validation technique, etc.)

#### 4.2.9 Table `activity_logs`
**Rôle:** Journal d'audit global (connexions, créations, modifications)

#### 4.2.10 Table `modification_logs`
**Rôle:** Historique détaillé des modifications par commande (champ, ancienne/nouvelle valeur)

---

## 5. DOCUMENTATION DES API

### 5.1 Authentification

#### POST /api/auth/login
**Objectif:** Authentification utilisateur  
**Accès:** Public  
**Body:**
```json
{ "username": "admin", "password": "admin123" }
```
**Réponse (200):**
```json
{ "token": "eyJhbGci...", "user": { "id": 1, "username": "admin", "role": "superadmin", "fullName": "Super Administrateur", "darkMode": false } }
```
**Erreurs:**
- 400: Champs manquants
- 401: Identifiants invalides ou compte désactivé

#### POST /api/auth/logout
**Objectif:** Déconnexion (côté client seulement, pas de session serveur)

#### GET /api/auth/me
**Objectif:** Récupérer l'utilisateur courant depuis le JWT  
**Accès:** Authentifié  
**Headers:** `Authorization: Bearer <token>`

### 5.2 Commandes

#### GET /api/orders
**Objectif:** Liste des commandes avec filtres  
**Accès:** Tous les rôles authentifiés  
**Query params:** `status`, `agencyId`, `priority`  
**Réponse:** Liste des commandes avec items, totaux (qty, produced, delivered, remaining)

#### POST /api/orders
**Objectif:** Créer une commande  
**Accès:** superadmin, commercial  
**Body:**
```json
{
  "orderNumber": "15-2026",
  "orderDate": "2026-07-23",
  "clientId": 1,
  "agencyId": 2,
  "affaire": "AFF-001",
  "status": "PREVISION",
  "items": [{ "articleName": "LED 50W", "quantity": 100 }]
}
```
**Effets:** Création de notifications pour technique et planification

#### PUT /api/orders/[id]
**Objectif:** Mise à jour d'une commande  
**Accès:** Varie selon les champs modifiés  
- Commercial: peut modifier orderNumber, orderDate, clientId, agencyId, affaire, status (commercial), items
- Technique: peut modifier techItems (spécifications techniques par article)
- Planification: peut changer productionStatus, plannedLoadingDate

**Verrouillage:** La commande est verrouillée pendant 5 minutes après modification

### 5.3 Production

#### GET /api/production
**Objectif:** Liste des articles en production  
**Accès:** superadmin, planification

#### POST /api/production
**Objectif:** Saisir un lot de production  
**Body:**
```json
{ "itemId": 5, "batchQty": 50, "productionDate": "2026-07-23" }
```
**Validation:** Ne peut pas dépasser la quantité restante à produire

### 5.4 Expédition

#### GET /api/expedition
**Objectif:** Liste des articles à expédier

#### POST /api/expedition
**Objectif:** Saisir une expédition  
**Body:**
```json
{ "itemId": 5, "batchQty": 25, "deliveryDate": "2026-07-24", "driverName": "Jean", "note": "Urgent" }
```

### 5.5 Dashboard

#### GET /api/dashboard
**Objectif:** Statistiques globales  
**Retourne:**
- totalOrders, totalClients, totalAgencies
- productionStatusDistribution (EN_INSTANCE, EN_PRODUCTION, LIVREE, ANNULEE)
- commercialStatusDistribution (SUR_STOCK, BON_COMMANDE, PREVISION)
- priorityDistribution
- agencyOrders (commandes par agence)
- monthlyOrders (évolution mensuelle)
- quantities (totalOrdered, totalProduced, totalDelivered, totalRemaining)

### 5.6 Sauvegarde

#### GET /api/backup
**Objectif:** Export JSON complet de toutes les tables  
**Accès:** superadmin uniquement

#### POST /api/backup
**Objectif:** Restauration complète depuis un fichier JSON  
**Accès:** superadmin uniquement  
**⚠️ Danger:** Efface toutes les données existantes

### 5.7 Autres endpoints

| Endpoint | Méthode | Objectif |
|----------|---------|----------|
| /api/users | GET/POST | CRUD utilisateurs (superadmin) |
| /api/clients | GET/POST/DELETE | CRUD clients |
| /api/agencies | GET/POST | CRUD agences |
| /api/matieres | GET/POST/PUT/PATCH/DELETE | CRUD matières |
| /api/material-categories | GET/POST | Catégories de matières |
| /api/notifications | GET | Notifications de l'utilisateur |
| /api/search | GET | Recherche globale (commandes, articles, clients) |
| /api/activity | GET | Journal d'activité |
| /api/import | POST | Import Excel (clients, agences) |
| /api/health | GET | Healthcheck + seed admin |

---

## 6. LOGIQUE MÉTIER

### 6.1 Cycle de vie d'une commande

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     CYCLE DE VIE D'UNE COMMANDE                          │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │   CRÉATION      │
                    │  (Commercial)   │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │  SUR_STOCK   │ │ BON_COMMANDE │ │  PREVISION   │
    │ (état comm.) │ │ (état comm.) │ │ (état comm.) │
    └──────────────┘ └──────────────┘ └──────────────┘
            │                │                │
            └────────────────┼────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   EN_INSTANCE   │  ← productionStatus initial
                    │  (En attente)   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              │              ▼
    ┌─────────────────┐      │    ┌─────────────────┐
    │    TECHNIQUE    │      │    │    ANNULEE      │
    │ Saisie specs    │      │    │ (Annulation)    │
    └────────┬────────┘      │    └─────────────────┘
             │               │
             ▼               │
    ┌─────────────────┐      │
    │   PRODUCTION    │◄─────┘
    │ Saisie lots     │
    │ EN_PRODUCTION   │
    └────────┬────────┘
             │ producedQty >= quantity
             ▼
    ┌─────────────────┐
    │   EXPEDITION    │
    │ Saisie livraisons│
    └────────┬────────┘
             │ deliveredQty >= quantity (tous articles)
             ▼
    ┌─────────────────┐
    │     LIVREE      │
    │ (État final)    │
    └─────────────────┘
```

### 6.2 Règles métier identifiées

1. **Numérotation des commandes:** Format "N-ANNEE" (ex: "12-2026"), auto-incrémenté par année
2. **Verrouillage concurrent:** 5 minutes de verrouillage après modification
3. **Statut commercial vs production:**
   - `status`: SUR_STOCK | BON_COMMANDE | PREVISION (fixé à la création)
   - `productionStatus`: EN_INSTANCE → EN_PRODUCTION → LIVREE (ou ANNULEE)
4. **Calcul automatique de LIVREE:** Quand tous les articles ont deliveredQty >= quantity
5. **Traçabilité technique:** Chaque champ technique (pcb, driver, etc.) garde trace de qui/quand
6. **Notifications automatiques:** À la création, validation technique, etc.

### 6.3 Système de rôles et permissions

| Rôle | Permissions |
|------|-------------|
| **superadmin** | Accès total, gestion utilisateurs, backup, reset |
| **commercial** | Création/modification commandes, clients, agences |
| **technique** | Saisie spécifications techniques, gestion matières |
| **planification** | Production, expédition, changement statut production |
| **consultant_prod** | Lecture seule (dashboard, commandes) |

### 6.4 États visuels des commandes

Le système calcule un état visuel basé sur les quantités :

```typescript
type OrderVisualState = "neutral" | "awaiting-delivery" | "delivered" | "cancelled";

function getOrderVisualState({ productionStatus, ordered, produced, delivered }) {
  if (productionStatus === "ANNULEE") return "cancelled";
  if (productionStatus === "LIVREE" || delivered >= ordered) return "delivered";
  if (produced >= ordered) return "awaiting-delivery";
  return "neutral";
}
```

---

## 7. SYSTÈME D'AUTHENTIFICATION ET SÉCURITÉ

### 7.1 Mécanisme d'authentification

```
┌──────────────────────────────────────────────────────────────┐
│                    FLUX D'AUTHENTIFICATION                   │
└──────────────────────────────────────────────────────────────┘

1. LOGIN
   Client                                              Serveur
     │                                                    │
     │─── POST /api/auth/login ──────────────────────────►│
     │    { username, password }                          │
     │                                                    │
     │                   ┌────────────────────────────────┤
     │                   │ - Recherche user en BDD        │
     │                   │ - bcrypt.compare(password)     │
     │                   │ - Génère JWT (jose, HS256)     │
     │                   │ - Expiration: 24h              │
     │                   └────────────────────────────────┤
     │                                                    │
     │◄── { token, user } ───────────────────────────────│
     │                                                    │
     │ localStorage.setItem("otp_token", token)           │
     │                                                    │

2. REQUÊTES AUTHENTIFIÉES
     │                                                    │
     │─── GET /api/orders ───────────────────────────────►│
     │    Header: Authorization: Bearer <token>           │
     │                                                    │
     │                   ┌────────────────────────────────┤
     │                   │ - Extrait token du header      │
     │                   │ - jose.jwtVerify()             │
     │                   │ - Vérifie rôle si requis       │
     │                   └────────────────────────────────┤
     │                                                    │
     │◄── { orders: [...] } ─────────────────────────────│
```

### 7.2 Structure du JWT

```typescript
{
  // Header
  alg: "HS256"
  
  // Payload
  id: 1,
  username: "admin",
  role: "superadmin",
  fullName: "Super Administrateur",
  darkMode: false,
  exp: <timestamp 24h>
}
```

### 7.3 Stockage côté client

- **Token:** `localStorage.getItem("otp_token")`
- **Pas de cookies HTTP-only** (vulnérabilité XSS potentielle - voir audit sécurité)

---

## 8. COMPOSANTS FRONTEND

### 8.1 Architecture des composants

```
App (layout.tsx)
└── AuthProvider (auth-context.tsx)
    ├── LoginPage (login/page.tsx)
    │   └── Formulaire de connexion
    │
    └── HomePage (page.tsx)
        ├── Sidebar
        │   └── Navigation par onglets selon rôle
        │
        └── Contenu principal (selon onglet actif)
            ├── DashboardView (graphiques recharts)
            ├── OrdersView (table + modal création/édition)
            ├── ProductionView (saisie lots)
            ├── ExpeditionView (saisie expéditions)
            ├── MatiereView (gestion catalogue)
            ├── ClientsView (CRUD clients)
            ├── AgenciesView (CRUD agences)
            ├── UsersView (CRUD utilisateurs)
            ├── WatchdogView (journal activité)
            └── BackupView (export/import)
```

### 8.2 Composants principaux

| Composant | Lignes | Complexité | Description |
|-----------|--------|------------|-------------|
| `OrdersView` | 380 | Haute | Gestion complète des commandes, modal multi-onglets |
| `BackupView` | 290 | Moyenne | Export/Import JSON avec prévisualisation |
| `ProductionView` | 209 | Moyenne | Saisie de production par lots |
| `ExpeditionView` | 197 | Moyenne | Saisie d'expéditions |
| `MatiereView` | 193 | Moyenne | Gestion catalogue matières |
| `DashboardView` | 117 | Moyenne | Graphiques avec recharts |

### 8.3 Gestion d'état

- **État global:** `AuthContext` (utilisateur connecté)
- **État local:** `useState` dans chaque composant
- **Pas de Redux/Zustand:** État simple via hooks React

---

## 9. AUDIT DE PERFORMANCES

### 9.1 Points positifs ✅

1. **Pool de connexions PostgreSQL:** Max 20 connexions, timeout configurés
2. **Requêtes optimisées:** Utilisation de `select()` avec colonnes explicites
3. **Pagination implicite:** Limite de 300 items dans production/expedition
4. **Build statique:** Pages login et home pré-rendues

### 9.2 Points d'attention ⚠️

1. **N+1 Queries potentiel:** Dans `/api/orders`, les items et composants techniques sont chargés séparément
   ```typescript
   // Actuel: 3 requêtes
   const data = await db.select().from(orders)...
   const allItems = await db.select().from(orderItems)...
   const allTechnicalComponents = await db.select().from(itemTechnicalComponents)...
   ```

2. **Pas de cache:** Aucune mise en cache côté serveur ou client

3. **Chargement initial:** Toutes les commandes sont chargées en une fois

4. **Images/assets:** Pas d'images dans le projet actuel (bon point)

### 9.3 Recommandations

1. Ajouter des index sur `orders.client_id`, `orders.agency_id`, `order_items.order_id`
2. Implémenter une pagination côté serveur pour les commandes
3. Considérer React Query pour le cache côté client

---

## 10. AUDIT DE SÉCURITÉ

### 10.1 Points positifs ✅

1. **Hashage bcrypt:** Mots de passe hashés avec salt (coût 10)
2. **JWT signé:** Utilisation de jose avec HS256
3. **Validation des rôles:** Vérification systématique dans les routes API
4. **Paramètres préparés:** Drizzle ORM protège contre les injections SQL
5. **Variables d'environnement:** Secrets dans `.env`

### 10.2 Vulnérabilités identifiées 🔴

| Sévérité | Problème | Description | Recommandation |
|----------|----------|-------------|----------------|
| **HAUTE** | Token en localStorage | Vulnérable aux attaques XSS | Utiliser cookies HTTP-only |
| **HAUTE** | JWT_SECRET par défaut | Clé hardcodée dans le code | Forcer une clé aléatoire en production |
| **MOYENNE** | Pas de rate limiting | Vulnérable au brute force | Implémenter rate limiting sur /login |
| **MOYENNE** | Pas de CSRF protection | Pas de token CSRF | Ajouter middleware CSRF |
| **BASSE** | Mot de passe admin visible | "admin123" dans la page login | Retirer en production |
| **BASSE** | Pas de validation d'entrée stricte | Validation basique | Utiliser Zod pour validation |

### 10.3 Code à risque

```typescript
// src/lib/auth.ts - Clé par défaut dangereuse
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "otp-super-secret-jwt-key-2024" // ⚠️ Fallback dangereux
);

// src/app/login/page.tsx - Indication du mot de passe
<p>admin / admin123</p>  // ⚠️ À retirer en production
```

---

## 11. AUDIT DE QUALITÉ DU CODE

### 11.1 Points positifs ✅

1. **TypeScript strict:** `strict: true` dans tsconfig
2. **Types bien définis:** Fichier `types.ts` complet
3. **Séparation des responsabilités:** API routes / composants / lib
4. **Conventions de nommage:** camelCase cohérent
5. **Gestion d'erreurs:** Try/catch dans les routes API

### 11.2 Points d'amélioration ⚠️

1. **Composants trop longs:** `OrdersView.tsx` (380 lignes) devrait être découpé
2. **Duplication de code:** Pattern `auth()` répété dans chaque route
3. **Magic strings:** Statuts hardcodés au lieu de constantes
4. **Pas de tests:** Aucun test unitaire ou d'intégration
5. **Documentation inline:** Peu de commentaires JSDoc

### 11.3 Métriques

| Fichier | Lignes | Évaluation |
|---------|--------|------------|
| `OrdersView.tsx` | 380 | À refactorer |
| `page.tsx` | 250+ | Acceptable avec extraction |
| Routes API | 50-150 | Bon |
| Schéma DB | 150 | Bien structuré |

---

## 12. DETTE TECHNIQUE IDENTIFIÉE

### 12.1 Dette critique 🔴

| ID | Problème | Impact | Effort estimé |
|----|----------|--------|---------------|
| DT-01 | Token localStorage | Sécurité XSS | 4h |
| DT-02 | Pas de tests | Régression | 2-3 jours |
| DT-03 | JWT secret par défaut | Sécurité | 1h |

### 12.2 Dette importante 🟠

| ID | Problème | Impact | Effort estimé |
|----|----------|--------|---------------|
| DT-04 | Composant OrdersView monolithique | Maintenabilité | 1 jour |
| DT-05 | Pas de pagination serveur | Performance | 4h |
| DT-06 | Validation d'entrée basique | Fiabilité | 1 jour |

### 12.3 Dette mineure 🟡

| ID | Problème | Impact | Effort estimé |
|----|----------|--------|---------------|
| DT-07 | Duplication code auth | DRY | 2h |
| DT-08 | Pas de logging structuré | Debug | 4h |
| DT-09 | Pas de cache | Performance | 4h |

---

## 13. OPPORTUNITÉS D'AMÉLIORATION

### 13.1 Améliorations prioritaires (sans casser l'existant)

1. **Sécurité:**
   - Migrer le token vers un cookie HTTP-only
   - Forcer JWT_SECRET en production
   - Ajouter rate limiting

2. **Performance:**
   - Ajouter pagination côté serveur
   - Implémenter React Query pour le cache

3. **Qualité:**
   - Ajouter Zod pour la validation
   - Écrire des tests E2E avec Playwright

### 13.2 Évolutions fonctionnelles possibles

1. Export PDF des commandes
2. Notifications push (WebSockets)
3. Mode hors-ligne (PWA)
4. Historique de production graphique
5. Intégration comptable

---

## 14. GUIDE D'INSTALLATION

### 14.1 Prérequis

- Node.js 18+ 
- PostgreSQL 14+
- npm ou pnpm

### 14.2 Installation

```bash
# 1. Cloner le dépôt
git clone https://github.com/raedkebaili/ORDER-TRACK-FINAL-2026.git
cd ORDER-TRACK-FINAL-2026

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
cp env.example .env
# Éditer .env avec vos valeurs

# 4. Créer la base de données
createdb otp_db

# 5. Appliquer le schéma
npx drizzle-kit push

# 6. Lancer en développement
npm run dev

# 7. Accéder à http://localhost:3000
# Identifiants par défaut: admin / admin123
```

### 14.3 Production

```bash
npm run build
npm start
```

---

## 15. GUIDE DE MAINTENANCE

### 15.1 Modifications du schéma

```bash
# Après modification de src/db/schema.ts
npx drizzle-kit push
```

### 15.2 Sauvegarde

1. Via l'interface: Onglet "Sauvegarde" → "Télécharger la sauvegarde"
2. Ou directement: `pg_dump otp_db > backup.sql`

### 15.3 Restauration

1. Via l'interface: Onglet "Sauvegarde" → "Restaurer" → Sélectionner fichier JSON
2. Ou: `psql otp_db < backup.sql`

### 15.4 Logs

- Journal d'activité: Onglet "Watchdog"
- Logs serveur: Sortie standard Next.js

### 15.5 Healthcheck

```bash
curl http://localhost:3000/api/health
# Attendu: { "ok": true }
```

---

## 📝 CONCLUSION

**OrderTrack Pro** est une application fonctionnelle et bien structurée pour la gestion de commandes. L'architecture Next.js App Router avec Drizzle ORM est moderne et maintenable.

**Points forts:**
- Architecture claire et modulaire
- Typage TypeScript strict
- Système de rôles bien implémenté
- UI moderne avec Tailwind

**Axes d'amélioration prioritaires:**
- Sécurité (token, rate limiting)
- Tests automatisés
- Refactoring des composants volumineux

**Prêt pour la production:** Avec les corrections de sécurité mentionnées, l'application peut être déployée en production.

---

*Document généré lors de l'audit technique - Juillet 2026*
