# Filtres des commandes — version à portée explicite

## Choix disponibles

Les anciens filtres d’avancement sont remplacés par ces seuls groupes dans Commandes (ordinateur et mobile) :

- **Commercial** : Prévision, Bon de commande, Sur stock / besoin interne.
- **Production — commande entière** : En attente de livraison, Non planifiée, Annulée.
- **Production — articles** : En cours de production, En attente de livraison, Annulés, Articles planifiés pour production.
- **Expédition — commande entière** : Totalement livrée, Partiellement livrée, Non planifiée, Annulée.
- **Expédition — articles** : En attente de livraison, Livrés, Annulés, Articles planifiés pour production, Articles non encore planifiés.

Les listes opérationnelles Production et Expédition exposent les états commerciaux et uniquement les groupes de leur section. Les filtres des journaux de planning et du bilan global restent les états des lignes de planning : ils servent à consulter les lignes exactes, y compris les historiques suspendus et terminés.

## Conditions de correspondance

La logique SQL est partagée entre commandes, listes opérationnelles, exports et regroupements. Les articles de quantité nulle ne participent pas aux conditions. Une commande vide ne satisfait pas artificiellement une condition « tous les articles ».

### Production

- **Commande en attente de livraison** : chaque article de quantité positive est entièrement produit, aucun n’a commencé à être livré et aucun n’est annulé. Le planning d’expédition ne vaut pas livraison réelle.
- **Commande non planifiée** : chaque article reste à produire et à livrer, n’est pas annulé et n’a aucun planning de production non annulé. Une production manuelle partielle sans planning ne crée pas artificiellement un planning.
- **Commande annulée** : annulation explicite de la commande ou annulation de production de tous ses articles.
- **Article en cours** : planning `EN_COURS` pour le même article **et** la même commande, à une date atteinte, avec quantité restant à produire et à livrer. Un cumul produit sans planning ne suffit jamais. Une autre ligne de la commande ne peut pas servir de preuve.
- **Article en attente de livraison** : entièrement produit, pas entièrement livré, non annulé. Peut appartenir à une commande dont les autres articles ne sont pas prêts.
- **Article planifié pour production** : planning `EN_ATTENTE`, `EN_COURS` ou `SUSPENDU`, avec quantité restant à produire et à livrer. Ce filtre indique une affectation de production ; il peut donc recouper « en cours ». Un planning futur est planifié, mais pas encore en cours.

### Expédition

- **Totalement livrée** : chaque article de quantité positive est entièrement livré selon ses propres quantités. L’ancien drapeau manuel `LIVREE` ne remplace pas ces quantités.
- **Partiellement livrée** : au moins un article a une quantité livrée positive et au moins un article n’est pas entièrement livré. Une simple affectation à un chauffeur ne suffit pas.
- **Commande non planifiée** : aucun article n’a de planning d’expédition non annulé, aucun n’a commencé à être livré et aucun n’est annulé. Le planning de production est distinct.
- **Commande annulée** : annulation explicite ou tous les articles annulés pour la production ou l’expédition.
- **Article livré** : quantité livrée de cet article supérieure ou égale à sa quantité commandée, pas simplement statut d’une ligne historique.
- **Article en attente de livraison** : même disponibilité réelle que dans la production.
- **Articles planifiés pour production** : volontairement lié au planning de **production**, conformément à la demande, pas à l’affectation chauffeur.
- **Articles non encore planifiés** : articles restant à produire et à livrer, sans planning de production non annulé et sans annulation.

Une annulation d’article est déduite du dernier planning créé (identifiant décroissant), sans autre planning actif de la même section. Une ancienne annulation ne contamine donc pas une replanification. Une annulation de production empêche aussi l’article d’être considéré disponible pour l’expédition. Une annulation de commande est prioritaire sur tous les filtres actifs.

## Portée commande / article

- Les filtres **commande entière** vérifient tous les articles ; en vue opérationnelle ils sélectionnent toute la commande ou aucun de ses articles.
- Les filtres **articles** retiennent les commandes contenant au moins un article correspondant. Le détail développé du tableau n’affiche que les articles concernés. Les regroupements et exports Excel ne réintroduisent pas les autres articles de ces commandes.
- Les données complètes de commande restent disponibles pour les totaux, les repères et la fiche d’édition ; aucun total de commande n’est recalculé sur les seules lignes affichées.
- Aucun surplus produit ou livré sur un article ne compense un autre article incomplet.

## Petits repères sur les commandes

- **● P x/y** : articles entièrement produits avec une quantité restant à livrer, en tenant compte des annulations selon le prédicat serveur.
- **✓ L x/y** : articles ayant une quantité livrée positive. L’infobulle distingue livraison partielle et totale, même si chaque article n’est livré qu’en partie.

Les repères portent sur la commande complète, même lorsqu’un filtre masque certains articles. Ils sont présents dans Commandes, Production, Expédition et les cartes mobiles. Les commandes annulées ne portent pas de repère de disponibilité.

## Garanties et vérifications

Les périmètres de droits restent cumulés avec les filtres. Les écritures de quantités, les cumuls, les retours arrière et la règle du besoin matière restent inchangés. Aucun changement de schéma n’est requis.

Les vues opérationnelles lisent les données dans une transaction à instantané répétable, en lecture seule. Les réponses asynchrones obsolètes sont ignorées. Les recherches accent-insensibles, le bilan toutes dates et les compteurs distincts sont conservés ; la limite de 500 entrées d’historique de lots reste en place.

Les anciens identifiants de filtres d’avancement ambigus ne sont plus acceptés (réponse 400), plutôt que de les traduire vers des résultats différents. Les préférences enregistrées avec un ancien filtre sont réinitialisées sur « Tous les états ». En cas d’erreur de lecture, les résultats du filtre précédent ne sont pas présentés comme ceux du nouveau filtre ; une erreur explicite est affichée. Les états commerciaux restent inchangés.

Les tests incluent l’exécution des prédicats et des véritables lectures API sur PGlite, les commandes multi-articles, les affectations croisées incohérentes, les plannings futurs, les annulations et replanifications, les droits agence, les exports Excel et les marqueurs visuels. Ils ne constituent pas une validation de concurrence multi-connexion sur la base de production.
