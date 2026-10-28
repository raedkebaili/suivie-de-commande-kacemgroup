# Archive commandes — affichage du classeur

- À l’ouverture de l’onglet, la dernière feuille dans l’ordre du classeur est sélectionnée (pas la première, ni un tri alphabétique inversé).
- Le sélecteur **Période / feuille** permet de choisir une feuille ou **Toutes les feuilles**.
- Une feuille est chargée intégralement : aucune pagination de 100 lignes ni limite silencieuse de 500 lignes. Le défilement du tableau reste disponible.
- En mode classeur, chaque feuille garde son titre, ses colonnes, son préambule, ses fusions, ses couleurs et ses éditeurs indépendants.
- La recherche et le filtre d’état portent sur toutes les feuilles affichées. **Actualiser** recharge leur contenu.
- Les droits d’import, de suppression, de modification et de coloration ne changent pas. Pour supprimer une feuille, la sélectionner individuellement.

## API

`GET /api/archive/rows?sheetId=<id>&all=1` renvoie toutes les lignes correspondant aux filtres `q` et `state`. La pagination existante reste disponible pour les appels sans `all=1`.

## Vérifications

Tests automatisés : dernière feuille sélectionnée, affichage de 602 lignes sans pagination, classeur avec colonnes différentes, éditeur rattaché à la bonne feuille, recherche et actualisation globales. Tests API : 650 lignes retournées, filtres, compatibilité pagination et contrôle d’authentification.

Recette après déploiement : ouvrir un classeur réel, vérifier sa dernière feuille et sa dernière ligne, afficher toutes les feuilles, rechercher un client, tester les modifications autorisées et le plein écran. Les grands classeurs peuvent demander davantage de temps et de mémoire puisque toutes les lignes sont affichées.

## État « Bon de commande »

- Disponible dans les listes d’état et de filtrage, sous la clé propre à l’archive `BON_COMMANDE`.
- Fond de ligne **blanc neutre par défaut**, y compris en thème sombre et avant le chargement de la nouvelle couleur serveur. Le paramétrage reste isolé sous `ARCHIVE_STATE_BON_COMMANDE`.
- Le changement d’état conserve les couleurs personnalisées et les marqueurs « Champs Modifiés » : une cellule modifiée garde sa couleur prioritaire.
- Un choix manuel « Bon de commande » reste prioritaire sur l’état du fichier et sur la règle automatique « Reste à livrer = 0 ». Revenir à « Auto » rétablit les règles existantes.
- L’import reconnaît « Bon de commande », la clé `BON_COMMANDE` et « BC ». Les anciennes lignes ne sont pas reclassées automatiquement.
