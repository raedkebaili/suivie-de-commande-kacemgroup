# 04 — Logique métier (Phase 5)

## Modèle d'autorisation

Un seul axe : le **rôle** (texte sur `users`, copié dans le JWT 24 h).

| Rôle | Périmètre observé |
|---|---|
| `superadmin` | tout + utilisateurs, sauvegarde/restauration, RAZ, couleurs, watchdog, stockage admin |
| `commercial` | commandes (création, édition), clients, agences, import Excel |
| `technique` | specs techniques articles, matières, composants dynamiques, études photométriques, télégestion |
| `planification` | production, expédition, planning journalier, usines, priorités ; ne peut créer que des commandes `SUR_STOCK` |
| `consultant_prod` | consultation seule (aucun droit d'écriture observé) |
| `recouvrement` | états de recouvrement (catalogue + affectation clients) |

## Cycle de vie d'une commande

```
CRÉATION (commercial | planification→SUR_STOCK)
  n° auto N/AAAA + statut commercial {PREVISION, BON_COMMANDE, SUR_STOCK}
  + productionStatus EN_INSTANCE
      │
      ▼
TECHNIQUE ── specs 7 familles (PCB, temp. couleur, lentille, driver,
  classe élec., accessoires, autres) + composants matières dynamiques
  (mise à jour différentielle) ⇒ techCompleted ✔
      │
      ▼
PLANIFICATION ── priorité (file P1…P10 / Normale), productionStatus,
  unité de production et date de chargement par article
  ⇒ planifCompleted ✔        (ANNULEE possible : motif + traçabilité)
      │
      ▼
PRODUCTION ── 2 chemins MÊME EFFET (source unique production-apply.ts) :
  a) lots saisis dans l'onglet Production
  b) planning journalier par usine, ligne passée à TERMINE (idempotent)
      │
      ▼
EXPÉDITION ── lots de livraison (chauffeur, chargement, note)
      │
      ▼
LIVREE (productionStatus) quand Σ livré ≥ Σ commandé
```

Règles associées vérifiées :

- **Numérotation** `N/AAAA` : table `order_counters` verrouillée
  `SELECT … FOR UPDATE` en transaction ; rattrapage depuis les commandes
  existantes (`N/AAAA` et historique `N-AAAA`) ; aperçu sans consommation.
- **Verrouillage optimiste** : toute écriture sur une commande acquiert un
  verrou de **5 minutes** (423 avec nom du verrouilleur sinon), relâché à la
  fin du `PUT`. Pas de verrou long.
- **Promotion des priorités** : quand une commande P1…P10 est *entièrement
  produite*, elle sort de la file (« Normale ») et **toutes les priorités
  inférieures remontent d'un cran** — chaque déplacement est tracé dans
  `modification_logs`. Les valeurs historiques `URGENTE/TRES_URGENTE` restent
  lisibles mais ne sont plus proposées (rétrocompat sans migration).
- **États visuels du tableau** (module pur `order-visual-state.ts`) :
  annulée > livrée > « production terminée, en attente de livraison >
  neutre » ; couleurs pilotables via `app_colors`.
- **Deux pistes d'état indépendantes** : le statut *commercial* est figé
  alors que `production_status` suit le cycle réel — le dashboard expose les
  deux distributions (compat conservée : `statusDistribution` miroir).

## Workflow documentaire

Le fichier physique vit **une seule fois** dans Google Drive
(`ORDERTRACK STORAGE/AFFAIRES|<ÉTUDES>/<entité>/`). L'API `documents` ne
crée que des **associations** (`drive_documents`, XOR commande/étude,
unicité par couple). Effets de bord additifs : `documentCount` et
`hasCahierDesCharges` remontés dans `GET /api/orders`, badge dans
l'onglet Commandes et Télégestion. Suppression = dissociation seule.

## Télégestion

Deux niveaux : `order_items.is_telegestion` (marquage commercial à la
saisie) et composants `item_technical_components.is_telegestion`
(hérité de la catégorie de matière). L'onglet permet au service technique
de suivre les articles « non traités » (`pending=1`).

## Archive commandes (historique Excel)

Import **sans impact** sur les tables actives (tables dédiées) avec fidélité
maximale : toutes les feuilles, ordre préservé, cellules fusionnées
propagées, préambule conservé, dates reformatées DD/MM/YYYY. État d'une
ligne = `stateOverride` (admin) → état lu dans le fichier → règle
« Reste à livrer = 0 ⇒ LIVRE » (**une cellule vide n'est jamais un 0**).
Couleurs de ligne par `app_colors` (catégorie `archive`) et couleurs de
cellule individuelles (`archive_cell_colors`) prioritaires.

## Recouvrement

Catalogue d'états dynamique (17 par défaut : « À échéance »…
« Clôturée »), chacun relié à un « ton » de `app_colors`. **Un seul état
courant par client** (upsert), historique complet dans
`client_recouvrement_logs`. Aucune facture : le module suit des états, pas
des montants (les prix existent au niveau `order_items.unit_price`).

## Sauvegarde / restauration

- **Export** (`collectBackupData`, source unique pour manuel + auto) :
  29 tables dans l'ordre FK-safe, `backup_history` exclue (sinon croissance
  exponentielle).
- **Restauration** : transaction unique — purge ordre inverse, réinsertion,
  recalage des séquences `setval`. **Gardes de rétrocompatibilité** : si un
  fichier ancien ne contient pas les tables de configuration / archive /
  planning, elles ne sont **pas** purgées.
- **Auto** : déclenchée par le navigateur du superadmin (planification
  quotidienne `backup_time`, rotation à `backup_max_count`).

## Règles implicites & pièges à connaître

- Le rôle **planification** est limité aux commandes `SUR_STOCK` **côté
  serveur** (ne pas se fier à l'UI).
- Supprimer un article **ayant déjà des lots** de production/expédition est
  refusé silencieusement (l'article est conservé).
- Les quantités saisies sont **bornées** (`Math.min(qty, restant)`) — pas
  d'erreur en cas de dépassement côté production/expédition.
- `consultant_prod` n'a aucune route d'écriture : simple lecteur.
- L'agence « Besoin interne / INTERNE » est **auto-créée** ; la supprimer
  casserait les futures commandes `SUR_STOCK` (FK orders.agency_id NOT NULL).
- `GET /api/auth/login` et `/api/health` appellent le seed admin : la base
  s'auto-amorce à la première requête.
- Les seeds de couleurs/états sont **additifs uniquement** — jamais
  d'écrasement des personnalisations admin.
