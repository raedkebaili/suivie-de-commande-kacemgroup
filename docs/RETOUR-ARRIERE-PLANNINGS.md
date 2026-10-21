# Correction d'une mauvaise manipulation de planning

## Utilisation

Dans **Planning production** et **Planning d'expédition**, chaque ligne (ordinateur et mobile) comporte une action **↶ Retour en arrière** pour les superadmins et responsables planification. Elle est désactivée si la ligne est déjà à son état initial ou pendant une correction. Les lecteurs ne peuvent pas l'utiliser, y compris par accès direct à l'API.

Une confirmation précise l'article, la commande, la date et la quantité réellement imputée. Annuler la confirmation ne modifie rien.

- **Production** : soustraction de `appliedQty` au cumul produit ; retour à **EN_ATTENTE**, `appliedQty = 0`, `appliedAt = null`, motif effacé. La quantité planifiée, l'usine et la date sont conservées.
- **Expédition** : soustraction de `loadedQty` au cumul livré ; retour à **NON_TRAITE**, `loadedQty = 0`. Le cumul produit n'est pas touché. La quantité planifiée, le chauffeur, la date et la note sont conservés. Le cas d'une livraison partielle via le module Expédition avec `planningId` est également couvert.
- Une ligne remise à zéro peut être traitée de nouveau normalement, sans double comptage. Une ligne encore appliquée ne peut plus être réouverte par un simple changement de statut.

**Exemple :** cumul produit 100 = 40 sur une première ligne + 60 sur une autre. Annuler la première laisse **60**, pas zéro. Si seuls 30 ont été appliqués sur une quantité planifiée de 100 (plafonnement au reste à produire), le retour retire **30**.

## Protections et dépendances

- Impossible de soustraire plus que le cumul courant ou de créer un cumul négatif.
- Impossible de ramener le produit sous le déjà livré : corriger d'abord les expéditions concernées.
- Une production réservée dans un planning d'expédition encore actif ne peut pas être retirée si cela rend cette réservation impossible. Après retour de livraison, cette ligne redevient une réservation active : l'annuler / l'ajuster avant de retirer sa production si nécessaire. Aucune autre ligne n'est effacée automatiquement.
- La création et la modification des réservations d'expédition contrôlent aussi les autres plannings actifs et sont sérialisées avec les corrections.
- Une version de ligne périmée ou une requête répétée produit un conflit explicite, jamais une deuxième soustraction. Actualiser puis confirmer à nouveau si nécessaire.
- Les anciennes lignes utilisent leurs compteurs d'application déjà existants : aucun rapprochement approximatif d'après la date, le chauffeur ou la quantité n'est nécessaire. Un ancien état Terminé/Livré sans quantité d'application fiable est refusé plutôt que de deviner une quantité à enlever.

## Cohérence et historique

Tout le retour (lot inverse, cumul, remise à zéro du planning, état de production de la commande et audit) est écrit dans **une transaction**. Ordre commun de verrouillage : commande, article, planning. Les validations de production/livraison utilisent les mêmes verrous ; la production et son marqueur de planning sont désormais appliqués atomiquement.

L'historique n'est pas supprimé : un **lot négatif** enregistre la correction, avec son nouveau cumul et son auteur. Le journal d'activité contient le type de retour, le planning, l'article, l'état précédent et les cumuls avant/après. Les vues d'historique affichent explicitement « correction » et un signe négatif. Ces tables faisant déjà partie des sauvegardes, les corrections sont sauvegardées sans migration de schéma.

L'état commercial de la commande n'est jamais modifié. L'état de production est recalculé depuis les quantités et les autres plannings actifs ; une commande réellement annulée n'est jamais réactivée automatiquement. Le statut « prête à livrer » est dérivé des quantités, donc suit lui aussi la correction. La date de livraison est effacée lorsque le cumul livré revient à zéro ; s'il reste d'autres livraisons, la date historique existante est conservée.

La synthèse du besoin matière considère les **soldes des lots par article**, et non l'existence d'un ancien lot positif déjà compensé. Une commande redevenue entièrement non traitée peut donc réapparaître, sous réserve de ses autres états/plannings et des règles d'éligibilité existantes. Aucun calcul de stock matière net n'est ajouté.

Les éventuelles promotions automatiques de priorité déclenchées par un ancien achèvement **ne sont pas inversées aveuglément** : cela pourrait écraser des décisions plus récentes sur d'autres commandes. Un rappel après correction de production invite à vérifier ces priorités. Les notifications historiques restent des événements historiques.

## API et validation

`POST /api/production-planning/:id/undo` et `POST /api/expedition-planning/:id/undo`, corps `{ confirmed: true, expectedUpdatedAt: <version reçue au chargement> }`. Aucune quantité fournie par le client n'est utilisée pour la soustraction.

Tests : PostgreSQL embarqué PGlite (colonnes/types/défauts issus du schéma applicatif), séquences produire/annuler/reproduire et livrer/annuler/relivrer, plusieurs lignes du même article, anciennes lignes, quantités appliquées plafonnées, livraison partielle, dépendances aux livraisons/réservations, absence de double soustraction, version périmée, refus des cumuls incohérents, rollback complet sur panne d'audit, retour du besoin matière, permissions API, confirmation acceptée/refusée et rafraîchissement UI. PGlite utilise une connexion sérialisée : ces tests ne remplacent pas un test de charge PostgreSQL multi-connexions.
