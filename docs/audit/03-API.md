# 03 — Documentation des API (Phase 4)

Conventions communes (vérifiées sur les 73 handlers) :

- Toutes déclarent `export const dynamic = "force-dynamic"` (aucun cache).
- Authentification : en-tête **`Authorization: Bearer <JWT HS256, 24 h>`** ;
  le jeton contient `{id, username, role, fullName, darkMode}`.
- Erreurs typées : `401 Non authentifié`, `403 Accès refusé`, `400` validation,
  `404`, `409/423` conflits métier, `500` (+ messages BD conviviaux).
- Toute écriture significative appelle `logActivity` (table `activity_logs`).
- Rôles : SA=superadmin, CO=commercial, TE=technique, PL=planification,
  CP=consultant_prod, RE=recouvrement, `*` = tout authentifié.

## Authentification & santé

| Endpoint | Droits | Fonction |
|---|---|---|
| `POST /api/auth/login` | public | Vérifie bcrypt, émet le JWT 24 h, log `LOGIN`. Le seed admin y est appelé. 400/401/500 |
| `POST /api/auth/logout` | * | Log `LOGOUT` seulement (JWT non révocable) |
| `GET /api/auth/me` | * | Renvoie le payload du jeton |
| `GET /api/health` | public | **Healthcheck + seeds idempotents** : admin par défaut, catégories de matières, recouvrement, archive, planning. 200/500 |

## Utilisateurs (SA uniquement)

| Endpoint | Fonction |
|---|---|
| `GET /api/users` | Liste sans `password_hash` |
| `POST /api/users` | Création (tous champs requis, unicité username, hash bcrypt) |
| `PUT /api/users/[id]` | Mise à jour partielle (dont mot de passe) |
| `DELETE /api/users/[id]` | Suppression ; **impossible de supprimer le dernier superadmin** |
| `GET /api/factories/users` | * : liste minimale (id, nom, rôle) pour choisir un responsable d'usine |

## Commandes — cœur métier

### `GET /api/orders` (*)
Filtres : `status`, `productionStatus`, `agencyId`, `priority`, `factory`
(nom d'usine via articles), `telegestion=1`. Jointure clients + agences,
chargement groupé des articles, composants techniques et **compteurs de
documents** (dont `hasCahierDesCharges`). Agrégats calculés :
`totalQty/Produced/Delivered/Remaining`. **Aucune pagination.**

### `POST /api/orders` (SA, CO, PL)
- Le rôle **planification ne peut créer que des commandes `SUR_STOCK`** —
  contrôle serveur explicite (403 si un autre état est demandé).
- `SUR_STOCK` sans agence ⇒ résolution automatique vers l'agence interne
  « Besoin interne / INTERNE », créée à la demande (correction documentée
  d'un ancien `agency_id = 0` qui violait la FK).
- Numéro **auto-généré** `N/AAAA` (transaction `FOR UPDATE`).
- Articles insérés en boucle (`articleName` non vide requis), cumuls à 0.
- Notification `notifyRole("planification", …)` à la création.

### `GET /api/orders/[id]` (*)
Commande + articles + composants techniques (groupés par article).

### `PUT /api/orders/[id]` (*) — orchestrateur par rôle
- **Verrou optimiste 5 min** : 423 si un autre utilisateur édite.
- Bloc **SA/CO** : infos, articles (ajout / renommage / suppression
  **refusée si des lots existent**), statut commercial limité à
  `{SUR_STOCK, BON_COMMANDE, PREVISION}` ; chaque changement →
  `modification_logs`.
- Bloc **SA/TE** : `techItems` (7 champs à triple traçabilité `By/At`
  **seulement si la valeur change**) et `dynamicTechItems` — mise à jour
  **différentielle transactionnelle** des composants (ajouts/suppressions
  journalisés, inchangés préservés) ; `techCompleted = true` + notification
  au créateur.
- Bloc **SA/PL** : `priority`, `productionStatus` (+ `statusReason`) ;
  `ANNULEE` ⇒ `cancelReason/By/At` ; `itemUpdates` (unité, date de
  chargement) ; `planifCompleted = true` + notification.
- Verrou relâché à la fin ; log `UPDATE_ORDER`.

### `DELETE /api/orders/[id]` (SA)
Suppression en cascade applicative (lots, logs, notifications, articles,
commande) + log.

### Autres routes commandes

| Endpoint | Droits | Fonction |
|---|---|---|
| `GET /api/orders/next-number` | SA,CO,PL | Aperçu du prochain n° **sans incrémenter** |
| `GET /api/orders/export` | * | Export Excel complet (articles, composants, études photométriques, libellés FR, regroupement par 4 caractères) — `xlsx` chargé dynamiquement |
| `GET /api/orders/grouped-articles` | * | Articles regroupés (module pur partagé) |
| `GET·PUT /api/orders/column-visibility` | * / SA | Colonnes/états masqués, ligne de totaux — JSON dans `system_settings` |
| `GET /api/order-modifications/[id]` | * | 100 derniers logs de modification d'une commande |

## Production & expédition

| Endpoint | Droits | Fonction |
|---|---|---|
| `GET /api/production` | SA,PL | 300 derniers articles + 500 derniers lots de production |
| `POST /api/production` | SA,PL | Délègue à **`production-apply.ts`** : quantité bornée au reste, lot, cumul, LIVREE si tout livré, **promotion des priorités**, log |
| `GET /api/expedition` | SA,PL | 300 articles + 500 lots d'expédition |
| `POST /api/expedition` | SA,PL | Lot d'expédition (chauffeur, date de chargement, note) ; refus si commande `ANNULEE` ; passage `LIVREE` quand livré ≥ commandé |
| `GET /api/expedition/[itemId]` | * | Historique des lots d'un article |

## Planning de production

| Endpoint | Droits | Fonction |
|---|---|---|
| `GET /api/production-planning?date=&factoryId=` | * | Planning journalier par usine + avancement réel des articles |
| `POST /api/production-planning` | SA,PL | Ajout d'articles : usine active requise, anti-doublon (jour+article+usine), état initial `EN_ATTENTE`, **recopie du nom d'usine** dans `order_items.production_unit`, retour `created/skipped` |
| `PUT /api/production-planning/[id]` | SA,PL | Changement d'état (raison obligatoire pour SUSPENDU/ANNULE). **`TERMINE` ⇒ applique la production** via `production-apply.ts`, **idempotent** (`applied_qty/at`) |
| `DELETE /api/production-planning/[id]` | SA,PL | Suppression d'une ligne planifiée |
| `GET /api/production-planning/active` | * | Lignes « en cours » (alerte du tableau des commandes) |

## Référentiels

| Endpoint | Droits | Fonction |
|---|---|---|
| `GET·POST /api/agencies` · `PUT·DELETE /api/agencies/[id]` | * / SA,CO / SA | CRUD agences (code forcé en majuscules) |
| `GET·POST /api/clients` · `PUT·DELETE /api/clients/[id]` | * / SA,CO | CRUD clients ; `DELETE /api/clients` (SA) = purge totale |
| `GET·POST /api/factories` · `PUT·DELETE /api/factories/[id]` | * / SA,PL | CRUD usines (responsable = utilisateur existant obligatoire) |
| `GET·POST /api/library/articles` | * | Autocomplétion articles (+compteur d'usage) |
| `GET /api/library/affaires` | * | Affaires distinctes des commandes (fréquence, filtre `q`) |
| `GET·POST /api/library/production-units` | **public** | Unités de production — **GET sans authentification** (voir 05) |
| `GET·POST·DELETE /api/library/tech` | * / SA,TE | Bibliothèque technique historique |
| `GET·POST /api/material-categories` · `PUT·DELETE /api/material-categories/[id]` | * / SA,TE | Catégories de matières (seed à 7 familles) |
| `GET·POST·PUT·PATCH·DELETE /api/matieres` | * / SA,TE | CRUD matières + **import Excel** (PUT multipart) ; DELETE = archivage (`active=false`) ; unicité référence par catégorie |
| `GET /api/matieres/search?q=&categoryId=` | * | Recherche serveur (ilike référence/libellé/catégorie/specs, max 50) |
| `GET·PUT /api/colors` · `POST` | * / SA | Lecture couleurs (seeds) ; modification HEX validée ; POST = restauration |
| `GET·PUT /api/settings` | SA | Paramètres clé/valeur (`backup_*`…) |

## Études photométriques & documents

| Endpoint | Droits | Fonction |
|---|---|---|
| `GET /api/photometric-studies?orderId=&standalone=` | * | Études + articles + `documentCount` |
| `POST·PUT /api/photometric-studies` | SA,TE | Création (commande **ou** affaire libre, n° d'étude, produits avec lentille `→ matieres`) ; PUT remplace les articles |
| `DELETE /api/photometric-studies` | SA | Suppression (cascade articles) |
| `GET·POST /api/documents?orderId=/studyId=` | * / rôles par entité | Liste des associations ; **POST multipart** : valide extension + 50 Mo, crée les dossiers Drive `AFFAIRES|ETUDES PHOTOMETRIQUES/<entité>`, téléverse, insère l'association |
| `DELETE /api/documents/[id]` | SA ou auteur | Supprime l'**association seulement** — le fichier reste dans Drive |

## Télégestion, recouvrement, archive

| Endpoint | Droits | Fonction |
|---|---|---|
| `GET /api/telegestion?q=&status=&pending=` | * | Articles `is_telegestion` regroupés par commande + composants télégestion ; `pending=1` = non traités |
| `GET·POST /api/recouvrement/states` · `PUT·DELETE /api/recouvrement/states/[id]` | * / SA,RE | Catalogue d'états (clé dérivée du libellé) ; DELETE refusé si utilisé |
| `GET·POST /api/recouvrement/client-states` · `GET·PUT /api/recouvrement/client-states/[clientId]` | * / SA,RE | État courant par client (upsert) + note + **log d'historique** |
| `GET /api/archive/sheets` · `DELETE` | * / SA | Liste des feuilles ; suppression feuille ou `?all=1` |
| `POST /api/archive/import` | SA | Import Excel fidèle (toutes feuilles, cellules fusionnées propagées, vrai en-tête détecté par mots-clés, préambule conservé, dates DD/MM/YYYY, 25 Mo max) |
| `GET /api/archive/rows?sheetId=&q=&state=&page=` | * | Lignes paginées (10–500), état résolu (override > fichier > règle « Reste à livrer = 0 » ; vide ≠ 0) |
| `PUT /api/archive/rows/[id]` | SA | `stateOverride` manuel |
| `GET·PUT /api/archive/cell-colors` | * / SA | Couleur par cellule (upsert sur UNIQUE(row,col), palette imposée) |

## Stockage Google Drive (centralisé)

| Endpoint | Droits | Fonction |
|---|---|---|
| `GET·PUT /api/storage/config` | * (masqué) / SA | État sans secret ; enregistrement OAuth (**secret chiffré**) |
| `POST /api/storage/oauth/start` | SA | URL de consentement (offline + consent ⇒ refresh token), **state anti-forge** |
| `GET /api/google-drive/oauth/callback` | (state) | Échange du code, **refresh token chiffré**, page HTML auto-fermante + `postMessage` |
| `GET /api/storage/files?folderId=&q=` | * | Listing paginé (tri serveur blanchi) + fil d'Ariane |
| `POST /api/storage/upload` | * | **PDF uniquement** (MIME + extension), 50 Mo, multi-fichiers |
| `GET /api/storage/download/[id]` | * | Flux du fichier depuis Drive |
| `DELETE /api/storage/files/[id]` · `PATCH` | SA / * | Corbeille / renommage-déplacement |
| `POST /api/storage/batch-delete` | SA | Suppression multiple |
| `GET·POST /api/storage/folders` | * | Arborescence / création (120 car. max) |
| `POST /api/storage/disconnect` | SA | Révocation (jetons effacés, fichiers conservés) |
| `GET /api/storage/stats` · `GET /api/storage/test` | * / SA | Quota et compteurs ; diagnostic de connexion |

## Sauvegarde / restauration / administration

| Endpoint | Droits | Fonction |
|---|---|---|
| `GET /api/backup` | SA | Export JSON complet (29 tables, ordre FK-safe) + enregistrement dans `backup_history` — **contient les hash de mots de passe** (voir 05) |
| `POST /api/backup` | SA | **Restauration** : purge puis réinsertion dans une transaction, `setval` des séquences, **gardes de rétrocompatibilité** (tables de config/archives/planning non purgées si absentes du fichier) |
| `POST /api/backup/auto` | SA | Sauvegarde automatique (appelée par le planificateur navigateur), rotation `backup_max_count` |
| `GET /api/backup/history` | SA | Historique sans le contenu |
| `GET /api/backup/download/[id]` | SA | Téléchargement d'une sauvegarde passée |
| `POST /api/admin/reset-database` | SA | **RAZ complète** : texte `REINITIALISER` + mot de passe admin requis, `TRUNCATE … RESTART IDENTITY CASCADE`, recrée admin/admin123 |

## Transverses

| Endpoint | Droits | Fonction |
|---|---|---|
| `GET /api/dashboard` | * | Compteurs, distributions (production/commercial/priorités/agences), 6 derniers mois, quantités globales |
| `GET /api/search?q=` | * | Commandes + articles + clients (ilike, ≥ 2 car., 20/20/10) |
| `GET /api/activity?limit=&userId=` | SA | Journal d'activité (watchdog) |
| `GET /api/notifications?unread=1` | * | 50 dernières notifications de l'utilisateur |
| `PUT /api/notifications/[id]` | * | Marque lue/non lue — **sans contrôle de propriété** (IDOR, voir 05) |
| `POST /api/import` (multipart) | SA,CO | Import Excel générique clients/agences |
| `GET /api/templates?type=clients\|agencies\|matieres` | * | Génère le **fichier Excel modèle** d'import (en-têtes FR, ligne d'exemple pour les matières) |
