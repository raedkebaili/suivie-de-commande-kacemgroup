# 06 — Audit des performances (Phase 7)

Uniquement des constats et des optimisations **sans changement
fonctionnel**. Contexte : application LAN, volumes typiques d'une PME
industrielle — la plupart des points ci-dessous ne deviennent critiques
qu'à grande échelle.

## Base de données

### Index manquants (le point le plus significatif)
Seuls `drive_documents` et `archive_cell_colors` ont des index explicites.
Requêtes fréquentes portant sur des colonnes **non indexées** :

| Requête observée | Colonne | Appelant |
|---|---|---|
| `order_items WHERE order_id IN (...)` | `order_items.order_id` | `GET /api/orders`, export, planning |
| `item_technical_components WHERE item_id IN (...)` / `order_id` | 2 FK | idem |
| `production_batches` / `expedition_batches WHERE item_id` | `item_id` | lots, suppression article |
| `modification_logs WHERE order_id` | `order_id` | fiche commande, contextual cellules |
| `notifications WHERE user_id (+ read)` | `user_id` | polling 30 s par utilisateur |
| `activity_logs ORDER BY created_at` / `WHERE user_id` | 2 | watchdog |
| `expedition_batches` jointure `orders.production_status = 'ANNULEE'` | — | filtrages |
- Les **FK** (`order_items.order_id` cascade, etc.) n'ont pas d'index :
  les suppressions en cascade feront des scans séquentiels croissants.

*Recommandation* : ajouter des index B-tree sur les FK ci-dessus (DDL
additive, zéro impact fonctionnel).

### Requêtes particulières
- **`GET /api/orders` : aucune pagination** — toutes les commandes + tous
  leurs articles/composants sont chargés à chaque ouverture de l'onglet
  (les requêtes annexes sont correctement **groupées** : 1 par table,
  filtrage en mémoire — pas de N+1 flagrant).
- `GET /api/production` et `/api/expedition` : bornées (`LIMIT 300/500`).
- Boucles d'insertion ligne à ligne : création de commande (articles),
  import matières/Excel, études, lots — un `INSERT` par élément (N
  requêtes) ; acceptable aux volumes actuels, candidat au `insert().values([...])`
  groupé si les fichiers grossissent.
- `PUT /api/orders/[id]` : contrôles `count(*)` par article supprimé —
  O(n) requêtes (minoritaire).
- `SELECT *` quasi systématique (colonnes inutiles rapatriées, ex.
  `archive_rows.cells` potentiellement volumineux — heureusement paginé).
- Healthcheck et GET de catalogues exécutent des **seeds de lecture**
  (SELECT par clé) à chaque appel — coût faible mais systématique.

## Backend / runtime

- **`force-dynamic` sur les 73 routes** : aucun cache Next.js (cohérent
  avec des temps de réponse LAN, mais aucune donnée de référentiel
  quasi-statique — couleurs, catalogues — n'est jamais mise en cache).
- Pool `pg` de 20 : adapté à un serveur unique ; `xlsx` et imports Google
  chargés **dynamiquement** (bon) — le code lourd n'entre pas au cold start.
- Sauvegarde/export : JSON complet **matérialisé en mémoire** puis écrit —
  O(taille de la base) en RAM par appel.
- `documents POST` charge le fichier en mémoire avant envoi Drive (50 Mo
  max — acceptable).
- Recherche globale : trois requêtes `ilike '%…%'` (scans séquentiels —
  index trigramme `pg_trgm` si les volumes grossissent).

## Frontend / bundle

- **`page.tsx` importe statiquement les 17 onglets** : tout le code métier
  (dont `xlsx`-light, recharts, 27 composants) est livré au premier
  chargement. Candidat : `next/dynamic` par onglet — gain massif de
  TTI, **aucun changement fonctionnel**.
- Notifications : polling 30 s par client connecté (prévoir SSE/websocket
  seulement si le parc grossit).
- `OrdersView` (≈1 070 lignes) reconstruit des listes à chaque rendu ;
  `recharts` n'est utilisé que sur le dashboard.
- Images : aucune — pas de sujet.

## Mesures vérifiables effectuées

- Taille du code : ~18 500 lignes TS/TSX (routes + composants + libs).
- Build de production du dépôt : compilé en environnement sandbox
  (voir `08-BUILD-DEPLOIEMENT.md`).

## Priorisation (rappel : rien d'appliqué)

1. Index FK (DDL additive).
2. `next/dynamic` sur les onglets hors dashboard/commandes.
3. Pagination serveur `GET /api/orders` (format de réponse à stabiliser
   d'abord — **impact contrat**, à traiter comme évolution).
4. Cache court (5–60 s) sur catalogues publics (couleurs, états).
