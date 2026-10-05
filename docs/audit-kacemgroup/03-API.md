# Phase 4 — Documentation des API

71 fichiers `route.ts` (~110 handlers). Conventions transverses :

- **Auth** : `Authorization: Bearer <JWT>` vérifié par `getUserFromHeaders`.
  Sauf mention contraire, tout endpoint exige un utilisateur authentifié ;
  la colonne « Rôles » précise les restrictions supplémentaires.
- **Réponses** : JSON ; erreurs `{ error: string }` + statut (400 validation,
  401 non authentifié, 403 rôle insuffisant, 404 absent, 409/423 conflit, 500 serveur).
- **Abréviations rôles** : SA = superadmin, COM = commercial, TECH = technique,
  PLAN = planification, CP = consultant_prod, REC = recouvrement, ✓ = tout rôle authentifié.
- Chaque route majeure est `force-dynamic` (pas de cache).
- Validation des entrées : manuelle (`parseInt`, présence de champs) — **pas de
  schéma zod** ; toutes les requêtes DB passent par Drizzle (paramétrées) sauf
  `sql.raw` sur liste blanche (backup) et `TRUNCATE` fixe (reset).

## 4.1 Authentification & santé

| Route | Verbe | Rôles | Objectif / règles |
|---|---|---|---|
| `/api/auth/login` | POST | public | Vérifie bcrypt, contrôle `active`, renvoie `{token, user}`. **Effet de bord** : appelle `seedDefaultUser()` (crée `admin/admin123` si absent). Journalise `LOGIN`. Pas de rate-limit. |
| `/api/auth/me` | GET | ✓ | Renvoie l'utilisateur du JWT (sans relecture DB). Seed admin également. |
| `/api/auth/logout` | POST | ✓ | Journalise `LOGOUT`, renvoie toujours succès (token non révoqué). |
| `/api/health` | GET | public | Santé + **seeds idempotents** (admin, catégories matières, recouvrement, couleurs archive/planning). `200 {ok:true}` / `500`. |

## 4.2 Commandes

| Route | Verbe | Rôles | Objectif / règles métier |
|---|---|---|---|
| `/api/orders` | GET | ✓ | Liste complète + items + composants techniques + totaux (`totalQty/Produced/Delivered/Remaining`). Filtres query : `status`, `productionStatus`, `agencyId`, `priority`, `factory` (via `order_items.production_unit`), `telegestion=1`. **Aucune pagination** (voir `06-PERFORMANCES.md`). |
| `/api/orders` | POST | SA, COM, PLAN | Création : n° auto `generateOrderNumber()` (thread-safe), `productionStatus=EN_INSTANCE`. PLAN est **verrouillé côté serveur** sur `status=SUR_STOCK` (« Sur Stock / Besoin interne ») et peut omettre l'agence → résolution/création auto de l'agence `INTERNE`. Items ignorés si `articleName` vide. Notifie rôles `technique` et `planification`. |
| `/api/orders/next-number` | GET | ⚠️ **public** | Aperçu du prochain n° (indicatif). Aucune donnée sensible mais fuite d'activité (compteur). |
| `/api/orders/[id]` | GET | ✓ | Détail + items + composants. |
| `/api/orders/[id]` | PUT | ✓ (périmètre par rôle) | **Route multi-sections, une par mission** : ① verrou optimiste 5 min (`423 Locked` si détenu par un autre) ; ② **SA/COM** : infos, statut commercial (`SUR_STOCK/BON_COMMANDE/PREVISION` uniquement), ajout/suppression/modif d'items — un item n'est supprimé que s'il n'a **aucun lot** production/expédition ; chaque champ modifié → `modification_logs` ; ③ **SA/TECH** (`techItems`) : 7 specs techniques avec `*_by/_at` seulement si valeur changée ; (`dynamicTechItems`) : mise à jour **différentielle** des composants matières (suppression/ajout loggés individuellement, traçabilité préservée), en transaction ; marque `tech_completed`, notifie le créateur ; ④ **SA/PLAN** : `priority`, `productionStatus` (+`statusReason`, annulation horodatée), `itemUpdates` (unité de production, date de chargement), marque `planif_completed`, notifie le créateur. Verrou relâché en fin de requête. |
| `/api/orders/[id]` | DELETE | SA | Suppression ordonnée (batches, logs, notifications, items, commande) — les FK `production_batches/expedition_batches` n'ont pas de cascade, d'où ces `DELETE` manuels. |
| `/api/orders/column-visibility` | GET/PUT | ✓ | Préférences de colonnes du tableau des commandes. |
| `/api/orders/grouped-articles` | GET | ✓ | Articles regroupés par 3 premiers caractères significatifs (`article-grouping.ts`). |
| `/api/orders/export` | GET | ✓ | Classeur Excel des commandes (`excel.ts`, `xlsx`). |
| `/api/search` | GET | ✓ | Recherche transversale. |
| `/api/templates` | GET | ✓ | Modèle (template) de fichier d'import. |
| `/api/import` | POST | SA, COM | Import Excel générique `clients`/`agencies` (FormData). Colonnes FR/EN, dédoublonnage par `code`, lignes invalides ignorées. |

## 4.3 Production, expédition, planning

| Route | Verbe | Rôles | Objectif / règles |
|---|---|---|---|
| `/api/production` | GET | SA, PLAN | 300 derniers items + 500 derniers lots (limites en dur). |
| `/api/production` | POST | SA, PLAN | Enregistre un lot via **`applyProductionQuantity` (source unique de vérité)** : quantité bornée au reste (`min(qty, remaining)`), interdit si commande `ANNULEE`, cumul sur item, passage auto `LIVREE` si tout est livré, log, **promotion automatique des priorités** si commande entièrement produite (jamais bloquante). |
| `/api/expedition`, `/api/expedition/[itemId]` | GET | SA, PLAN (GET [itemId] : ✓) | Mêmes limites 300/500 ; historique par article. |
| `/api/expedition` | POST | SA, PLAN | Lot d'expédition : quantité bornée au reste, interdit si `ANNULEE`, met à jour `delivered_qty/delivery_date`, passage `LIVREE` si total livré, log. |
| `/api/production-planning` | GET/POST | SA, PLAN (`canManage`) | Entrées de planning par date/usine ; création avec copies d'historique. |
| `/api/production-planning/active` | GET | SA, PLAN | Planning actif. |
| `/api/production-planning/[id]` | PUT | SA, PLAN | **Règle clé** : au statut `TERMINE` (et seulement si `applied_at` NULL), la quantité planifiée est appliquée à la production réelle via `applyProductionQuantity` — **idempotent**, refus == pas de changement de statut. Statuts : `EN_ATTENTE/EN_COURS/SUSPENDU/ANNULE/TERMINE` (+`reason`). |
| `/api/production-planning/[id]` | DELETE | SA, PLAN | Suppression d'une ligne (si non appliquée). |
| `/api/factories` | GET/POST | GET ✓ / POST SA, PLAN | Usines ; `responsable_id` doit référencer un utilisateur (FK RESTRICT). |
| `/api/factories/[id]` | PUT/DELETE | SA, PLAN | Modification / suppression (bloquée si planning associé : FK SET NULL en place, mais contrôle applicatif). |
| `/api/factories/users` | GET | SA, PLAN | Utilisateurs assignables comme responsables. |

## 4.4 Catalogue technique & télègestion

| Route | Verbe | Rôles | Objectif |
|---|---|---|---|
| `/api/material-categories` | GET/POST | GET ✓ / écriture SA, TECH | Familles de matières (seed paresseux au health). |
| `/api/material-categories/[id]` | GET/DELETE/PATCH | SA, TECH | Détail, activation/désactivation (PATCH), suppression (DELETE — bloquée si matières rattachées : FK RESTRICT). |
| `/api/matieres` | GET | ✓ | Catalogue + filtres (`categoryId`, `active`, recherche). |
| `/api/matieres` | POST/PUT/PATCH/DELETE | SA, TECH | CRUD matières (référence défaut `SANS-REF`), gestion stock/specs. |
| `/api/matieres/search` | GET | ✓ | Recherche pour autocomplétion. |
| `/api/telegestion` | GET | ✓ | Articles `is_telegestion` regroupés par commande + composants télégestion saisis. Filtres `q`, `status`, `pending=1`. |
| `/api/library/affaires` | GET | ✓ | Suggestions d'intitulés d'affaires. |
| `/api/library/articles` | GET/POST | ✓ | Bibliothèque d'articles (`usage_count++`). |
| `/api/library/production-units` | GET/POST | ✓ | Bibliothèque d'unités de production. |
| `/api/library/tech` | GET/POST/DELETE | ✓ (conforme fichier) | Valeurs techniques par catégorie (autocomplétion des specs). |
| `/api/photometric-studies` | GET/POST/PUT/DELETE | GET ✓ / écriture SA, TECH | Études photométriques liées commande ou indépendantes ; items (lentilles depuis `matieres`) remplacés en transaction à l'UPDATE. |

## 4.5 Référentiels commerciaux & recouvrement

| Route | Verbe | Rôles | Objectif |
|---|---|---|---|
| `/api/agencies` | GET/POST | SA, COM | CRUD agences (unicité nom/code). |
| `/api/agencies/[id]` | PUT | SA, COM | Modification. |
| `/api/agencies/[id]` | DELETE | SA | Suppression (protégée par FK commandes). |
| `/api/clients`, `/api/clients/[id]` | idem | idem | CRUD clients (+ GET/POST/DELETE groupés). |
| `/api/recouvrement/states` | GET/POST | ✓ / SA, REC | Catalogue d'états de recouvrement (clé, libellé, `colorKey`, tri). |
| `/api/recouvrement/states/[id]` | PUT/DELETE | SA, REC | Modification ; suppression bloquée si état attribué (FK RESTRICT). |
| `/api/recouvrement/client-states` | GET | ✓ | États courants des clients. |
| `/api/recouvrement/client-states/[clientId]` | PUT | SA, REC | Upsert de l'état courant + journal `client_recouvrement_logs` (traçabilité style activity_logs). |

## 4.6 Utilisateurs, notifications, administration

| Route | Verbe | Rôles | Objectif |
|---|---|---|---|
| `/api/users` | GET/POST | SA | Gestion des comptes (rôle, actif, hachage bcrypt). |
| `/api/users/[id]` | PUT/DELETE | SA | Modification (dont mot de passe), suppression. |
| `/api/notifications` | GET | ✓ | Notifications de l'utilisateur courant. |
| `/api/notifications/[id]` | PUT | ✓ | Marquer comme lue. |
| `/api/order-modifications/[id]` | GET | ✓ | Historique des modifications d'une commande. |
| `/api/activity` | GET | SA | Journal d'activité global (onglet Watchdog). |
| `/api/dashboard` | GET | ✓ | Agrégats du tableau de bord. |
| `/api/colors` | GET | ✓ | Couleurs dynamiques (tous les clients en ont besoin). |
| `/api/colors` | PUT/POST | SA | Modification/création de couleurs (onglet Couleurs). |
| `/api/settings` | GET/PUT | SA | Paramètres système (dont `backup_time`, `backup_max_count`). |
| `/api/admin/reset-database` | POST | SA | **Réinitialisation totale** : confirmation texte `REINITIALISER` + **mot de passe admin revérifié** ; `TRUNCATE … RESTART IDENTITY CASCADE` sur 16 tables explicites (le CASCADE vide de fait toutes les tables FK-dépendantes) puis recrée `admin/admin123`. |

## 4.7 Sauvegarde / restauration

| Route | Verbe | Rôles | Objectif |
|---|---|---|---|
| `/api/backup` | GET | SA | Export JSON intégral des tables (`backup-data.ts`). |
| `/api/backup` | POST | SA | **Restauration** : transaction, vidage + réinsertion par chunks, resynchronisation des séquences (`setval`) sur liste blanche de tables. |
| `/api/backup/auto` | POST | SA **ou** en-tête `x-backup-secret == BACKUP_SECRET` (cron) | Sauvegarde automatique : JSON stocké en `backup_history.backup_data`, rotation `backup_max_count`, statuts en `system_settings`. |
| `/api/backup/auto` | GET | SA | Statut du planificateur (dernière exécution…). |
| `/api/backup/history` | GET | SA | Historique des sauvegardes. |
| `/api/backup/download/[id]` | GET | SA | Télécharge le JSON d'une sauvegarde passée. |

## 4.8 Archive (module indépendant)

| Route | Verbe | Rôles | Objectif |
|---|---|---|---|
| `/api/archive/sheets` | GET | ✓ | Liste des feuilles importées + métadonnées colonnes. |
| `/api/archive/sheets` | DELETE | SA | Suppression d'une feuille (cascade lignes + couleurs). |
| `/api/archive/rows` | GET | ✓ | Lignes d'une feuille (triées par `row_index`). |
| `/api/archive/rows/[id]` | PUT | SA | `state_override` manuel (prioritaire sur l'état détecté, sinon règle « Reste = 0 ⇒ LIVRÉ »). |
| `/api/archive/import` | POST | SA | Import Excel fidèle (préambule, ordre des colonnes, cellules vides conservées, détection des colonnes « Reste à livrer/Clients/Affaire/État », fusions verticales). |
| `/api/archive/cell-colors` | PUT | SA | Couleur d'une cellule (upsert sur `(row_id, column_index)`). |

## 4.9 Stockage Google Drive (centralisé)

| Route | Verbe | Rôles | Objectif |
|---|---|---|---|
| `/api/storage/config` | GET | ✓ | État de la connexion ; **les secrets ne sont jamais renvoyés** (masqués via `maskSecret`). PUT = SA. |
| `/api/storage/oauth/start` | POST | SA | Prépare l'URL de consentement (`access_type=offline`, `prompt=consent`), `state = userId.nonce` stocké temporairement en `last_error`. |
| `/api/google-drive/oauth/callback` | GET | public (protégé) | Échange code → refresh token, **vérification stricte du `state`**, chiffrement AES-256-GCM, création/réutilisation du dossier racine. Page HTML de clôture + `postMessage` à l'onglet d'origine. |
| `/api/storage/disconnect` | POST | SA | Déconnexion (purge jeton). |
| `/api/storage/test` | POST | SA (conforme fichier) | Test de connectivité Drive. |
| `/api/storage/files` | GET | ✓ | Liste des fichiers du dossier racine (pagination Drive). |
| `/api/storage/folders` | GET/POST | ✓ | Sous-dossiers. |
| `/api/storage/upload` | POST | ✓ | Upload multi-fichiers vers Drive (≤ 50 Mo, non vide ; rapport par structure). |
| `/api/storage/files/[id]` | PUT/DELETE | ✓ | Renommer / supprimer un fichier Drive. |
| `/api/storage/batch-delete` | POST | ✓ | Suppression en lot. |
| `/api/storage/download/[id]` | GET | ✓ | Proxy de téléchargement ; accepte aussi le JWT **en query `?token=`** (usage `<a download>`) — voir `05-SECURITE.md`. |
| `/api/storage/stats` | GET | ✓ | Quota/statistiques du dossier. |

## 4.10 Appels externes

Unique fournisseur externe : **Google** (Drive + OAuth2 + userinfo) — toujours
côté serveur (`src/lib/google-drive.ts`), jamais depuis le navigateur. Aucune
autre API externe appelée.
