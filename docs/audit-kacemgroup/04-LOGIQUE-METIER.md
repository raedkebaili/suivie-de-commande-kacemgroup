# Phase 5 — Logique métier

## 5.1 Cycle de vie d'un utilisateur

Créé par le SA (`/api/users`) avec un rôle ; `admin/admin123` est seedé si la
base est vide. `active=false` bloque le login, **mais** un JWT déjà émis reste
valide 24 h (ni le rôle ni `active` ne sont relus en base à chaque requête).
Suppression possible par le SA (contraintes FK : SET NULL sur les historiques,
RESTRICT si responsable d'usine). 6 rôles : `superadmin, commercial, technique,
planification, consultant_prod, recouvrement`.

## 5.2 Cycle de vie d'une commande

```
CRÉATION (COM ou SA ; PLAN limité à SUR_STOCK)
  n° auto N/AAAA (compteur annuel, FOR UPDATE)
  status commercial : PREVISION ‖ BON_COMMANDE ‖ SUR_STOCK
  productionStatus  : EN_INSTANCE
        │
        ▼
TRAITEMENT TECHNIQUE (TECH/SA)          PLANIFICATION (PLAN/SA)
  7 specs par article (+ by/at)           priorité P1…P10 / NORMALE
  composants matières (différentiel,      unité de production (= factories.name,
      traçabilité par composant)              copie texte volontaire)
  tech_completed = true                   date de chargement planifiée
        │                                 productionStatus (+ motif)
        │                                 planif_completed = true
        ▼
PLANNING JOURNALIER (PLAN/SA)
  lignes par date + usine (jamais d'écriture directe sur order_items)
  statut TERMINE → versement UNIQUE de la quantité à la production réelle
        │
        ▼
PRODUCTION (PLAN/SA) — lots cumulés, bornés au commandé
  commande entièrement produite → état visuel « en attente de livraison »
  + PROMOTION AUTOMATIQUE des priorités (la commande sort de la file → NORMALE,
    toutes les commandes numérotées en dessous remontent d'un cran)
        │
        ▼
EXPÉDITION (PLAN/SA) — lots, chauffeur, note
  total livré ≥ total commandé ⇒ productionStatus = LIVREE (auto,
    depuis l'expédition OU la production)
        │
        ▼
ANNULATION possible côté planification (productionStatus=ANNULEE + motif +
  auteur + date) : production/expédition ensuite refusées.
SUPPRESSION : SA uniquement ; les items avec des lots ne peuvent disparaître
  que par suppression de la commande entière (DELETE ordonné).
```

## 5.3 Collaboration inter-services sur la même commande

Trois services écrivent sur la **même ligne `orders`**, chacun dans son
périmètre (route PUT multi-sections) :
- **Commercial** : infos + articles. Impossible de supprimer un article déjà
  produit/expédié. Tous les changements sont historisés dans `modification_logs`.
- **Technique** : specs + composants ; notifie le créateur à chaque livraison
  (« Tech OK »). La mise à jour des composants est différentielle en
  transaction — jamais de perte de traçabilité sur les composants inchangés.
- **Planification** : priorités, statuts de production, unités/dates ; ajoute
  des verrous de cohérence (refus de produire/expédier une commande annulée).
- **Verrou d'édition** : PUT prend un verrou de 5 min (`423` si détenu par un
  autre utilisateur) — protection anti-écrasement simple, applicative.

## 5.4 Règles de calcul

- **Numérotation** : `order_counters(year)` + `SELECT … FOR UPDATE` ; si la
  ligne de l'année n'existe pas, initialisation à partir du max existant.
- **Cumuls** : `produced_qty` / `delivered_qty` sont des **caches dénormalisés**
  maintenus à chaque lot (`actualQty = min(demandé, restant)`), jamais négatifs,
  jamais au-delà du commandé. `cumulative_total` redondant conservé par lot.
- **Passage LIVREE** : comparaison `sum(delivered) >= sum(quantity)` recalculée
  après chaque lot (production ou expédition).
- **Promotion des priorités** : file P1…P10 resserrée quand une commande
  numérotée devient entièrement produite ; chaque déplacement est loggé dans
  `modification_logs` ; l'échec de la promotion ne fait **jamais** échouer le lot.
- **État visuel** (`order-visual-state.ts`) : `cancelled` > `delivered` (statut
  LIVREE ou tout livré) > `awaiting-delivery` (tout produit) > `neutral`.
- **Archive** : état effectif = `state_override` (manuel) ?? `state_detected`
  (fichier) ?? règle « Reste à livrer = 0 ⇒ LIVRÉ » (cellule vide ≠ 0).
- **Regroupement d'articles** : clé = 3 premiers caractères significatifs
  (NETLUX 150W ≈ NETLUX 200W).

## 5.5 Fonctionnalités « cachées » / règles implicites (à connaître)

1. `GET /api/health`, `/api/auth/login`, `/api/auth/me` **déclenchent des seeds**
   (admin, catégories, états, couleurs). Un healthcheck a donc des effets de bord.
2. Le service planification ne peut créer **que** du `SUR_STOCK` (contrôle
   serveur, pas seulement UI) — et l'agence `INTERNE` est créée à la volée
   (correction historique d'un bug de FK `agency_id = 0`, documentée dans le code).
3. `storage_config.last_error` sert de sas temporaire au `state` OAuth
   (`oauth_state:`) — ne pas « corriger » ce champ.
4. Le `TRUNCATE … CASCADE` du reset DB vide implicitement toutes les tables
   référençant celles listées ; `order_counters`, `app_colors`, `system_settings`,
   `recouvrement_states` survivent (pas de FK entrante).
5. Les batches n'ont **pas** de cascade en base : suppression de commande =
   séquence manuelle de DELETE (l'ordre compte).
6. Consultant_prod : lecture seule de fait (aucun endpoint d'écriture ne
   l'accepte ; il lit ce qui est ouvert à tout authentifié).
7. Backup : le fichier complet vit aussi **dans la base** (`backup_data`) —
   vérifier la volumétrie avant de multiplier les rétentions.

## 5.6 Dépendances critiques entre modules

- `production-apply.ts` est partagée par **Production** et **Planning** : toute
  évolution doit conserver l'équivalence stricte des deux chemins.
- `app_colors.key` est référencé logiquement (sans FK) par
  `recouvrement_states.color_key` : supprimer une couleur casse le rendu.
- `order_items.production_unit` = texte copié de `factories.name` : renommer
  une usine ne met pas à jour les items historiques (comportement voulu et
  documenté dans le schéma).
- Le filtre `factory` de `/api/orders` dépend de cette copie texte.
