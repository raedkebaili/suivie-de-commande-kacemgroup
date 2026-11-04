# Filtres d’avancement et bilan des plannings

## Utilisation

Le filtre des commandes distingue désormais l’état commercial de l’avancement réel : prêt à livrer, en cours de livraison, livré, annulé, sans planning actif, ainsi que les états des plannings de production et d’expédition. Les anciennes valeurs d’API restent compatibles ; les anciens choix manuels de production ne pilotent plus ce nouveau filtre.

Les écrans Production et Expédition recherchent et filtrent les articles individuellement, y compris dans une commande contenant plusieurs articles à des stades différents. Les totaux et l’état de l’en-tête restent ceux de la commande complète : ils ne sont pas recalculés sur les seuls articles affichés. Les compteurs indiquent les commandes et articles affichés. La recherche ignore les accents et combine les mots saisis, sur les informations de commande et de produit disponibles (et le chauffeur en expédition).

Les commandes, exports et regroupements utilisent en revanche une portée commande : une commande peut correspondre à plusieurs états selon ses articles. « Prêt à livrer » exige que chaque article de quantité positive soit entièrement produit, sans livraison commencée ni expédition active ; un excédent sur un article ne compense pas un manque sur un autre.

## Bilan global

Le bilan intégré aux écrans opérationnels est en lecture seule et parcourt toutes les dates. Recherche, état et dates permettent de retrouver les lignes sans ouvrir chaque journée. Il distingue le nombre de lignes de planning, les articles distincts et les commandes distinctes, sans additionner plusieurs fois les cumuls d’un même article.

Les plannings de production et d’expédition, sur ordinateur et mobile, proposent également un mode toutes dates, la recherche et le filtre d’état. La recherche d’expédition s’effectue localement, sans requête HTTP à chaque frappe. Le bilan ouvert et visible se rafraîchit toutes les 30 secondes et au retour sur la fenêtre ; les réponses obsolètes sont ignorées.

## Règles et garanties

- Un planning de production `EN_COURS` daté dans le futur, sans activité réelle, reste en attente de démarrage. Le bilan précise que sa date n’est pas atteinte.
- Une date atteinte ou des quantités réellement produites permettent d’identifier la production en cours. Une suspension empêche la déduction par simple progression, sauf autre planning actif.
- Les quantités livrées et les affectations d’expédition actives participent à l’état de livraison, toutes dates confondues par défaut.
- Le besoin matière conserve ses conditions commerciales et la règle « une unité par article commandé ». Un planning futur seul ne rend pas la commande traitée ; une activité réelle, une application de planning ou un mouvement net de production l’exclut du besoin non traité.
- Les filtres s’ajoutent aux périmètres de droits existants ; le mode global ne supprime pas les restrictions agence/usine applicables.
- Les lectures opérationnelles des articles, identifiants correspondants et données associées utilisent une transaction en lecture seule, à instantané répétable.
- Les écritures de quantités, annulations et retours arrière ne sont pas modifiés par cette fonctionnalité. Aucune migration de schéma n’est nécessaire pour ces filtres.
- L’ancienne limite de 300 articles des vues opérationnelles est supprimée. L’historique de lots y conserve sa limite de 500 entrées : ce n’est pas un export exhaustif du journal historique.

## Vérification

Les tests couvrent notamment les prédicats SQL sur PostgreSQL embarqué (PGlite), les portées commande/article, plus de 300 articles, les droits du planning global, les dates futures, la recherche, le bilan en lecture seule et les réponses asynchrones obsolètes. Les tests embarqués ne remplacent pas une validation de concurrence multi-connexion sur la base de production.
