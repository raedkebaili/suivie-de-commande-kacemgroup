# Phase 7 — Audit des performances

Objectif : repérer les points chauds **sans** proposer de changement de
comportement fonctionnel. Aucun profiling dynamique n'a été exécuté (audit
statique) ; les constats sont étayés par le code.

## 7.1 Points positifs

1. **Limites en dur** sur les vues volumineuses : production et expédition
   plafonnent à 300 items / 500 lots.
2. `xlsx` est **importé dynamiquement** (`await import("xlsx")`) dans plusieurs
   routes serveur → hors du chemin critique.
3. Pool PostgreSQL dimensionné (`max=20`, timeouts explicites) et lazy (rien au
   build).
4. Pas de cache incohérent : `force-dynamic` partout = données toujours fraîches
   (choix assumé pour un outil interne multi-opérateurs).
5. Batchs chunckés à la restauration de backup (`insertChunked`).
6. Requêtes agrégées en SQL (`sum`, `count`) plutôt que boucles JS pour les
   cumuls critiques (LIVREE, complétude).

## 7.2 Points d'attention (sans changement fonctionnel requis)

| # | Constat | Localisation | Nature |
|---|---|---|---|
| P-1 | `GET /api/orders` charge **toutes** les commandes + tous leurs items + tous les composants, puis assemble en JS : `data.map(o => allItems.filter(i.orderId===o.id))` = **O(commandes × items)** | `api/orders/route.ts:48-85` | Croissance quadratique avec l'historique ; à horizon, regrouper par index ou paginer (filtre côté UI identique). |
| P-2 | **Aucun index secondaire** sur les FK de fort trafic (`order_items.order_id`, `production_batches.item_id`, `expedition_batches.item_id`, `notifications.user_id`, `modification_logs.order_id`, `archive_rows.sheet_id`, `production_plan_entries.plan_date`) | `schema.ts` | Seq scans dès que les volumes montent. Ajouter des index est sans effet fonctionnel. |
| P-3 | Filtres `factory` / `telegestion=1` : `selectDistinct` complet rescané à chaque appel, puis `inArray` potentiellement large | `api/orders/route.ts:31-45` | Sous-requête EXISTS ou index sur `production_unit`/`is_telegestion`. |
| P-4 | **N+1 applicatifs** : création/édition d'une commande = 1 requête par item ; mise à jour tech différentielle = ~2 requêtes par composant | `orders/route.ts`, `orders/[id]/route.ts` | Acceptable aux volumes actuels ; à surveiller au-delà de ~50 items/commande. |
| P-5 | Dashboard/appels initiaux : `GET /api/orders` + production + expédition rapatrient des centaines de lignes sérialisées en une réponse | routes concernées | Réponses JSON lourdes sur LAN faible. |
| P-6 | Fichier `backup_history.backup_data` (JSON intégral) multiplié par la rétention | `schema.ts`, `backup/auto` | Croissance DB silencieuse. |
| P-7 | **Bundle initial** : `page.tsx` importe les 17 vues (dont OrdersView 992 l., BackupView 640 l., StorageView 544 l., recharts) → un seul chunk client probablement > 500 Ko | `src/app/page.tsx` | Code-splitting par `next/dynamic` (sans changer l'UX) = chargement initial beaucoup plus rapide. |
| P-8 | `verifiedAt`… — horodatages `updatedAt: new Date().toISOString()` passés en texte : tri OK, comparaisons OK ; rien à faire. | — | Simple note de cohérence. |
| P-9 | `seedDefaultUser()` (SELECT) exécuté à **chaque** `login`/`me`/health | `auth.ts` | Requête superflue par appel ; mise en cache du seed possible sans effet visible. |
| P-10 | SSR inutilisé : toute l'UI est client ; premier rendu dépend d'un aller-retour `/api/auth/me` | `page.tsx` | Choix acceptable pour une SPA interne ; hydratation correcte. |

## 7.3 Recommandations (toutes sans effet fonctionnel)

1. **Index** sur les FK et colonnes de filtre listées (P-2, P-3).
2. **Code-splitting** des vues d'onglets via `next/dynamic` + chargement paresseux de `recharts` et `xlsx` côté client (P-7).
3. Remplacer l'assemblage quadratique de `/api/orders` par un groupage en Map
   (même réponse, O(n)) — gain immédiat sans toucher au contrat.
4. Rotation/archivage externe du JSON de backup ; surveiller `pg_total_relation_size`.
5. Mesurer avant/après (`EXPLAIN ANALYZE` sur les 3 requêtes principales) avant
   toute optimisation supplémentaire — ne pas optimiser à l'aveugle.
