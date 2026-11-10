# Lisibilité des besoins et notes commerciales

## Problème corrigé

Les champs `clientSpec` (Besoin client) et `note` (Note commerciale) étaient tronqués dans des cellules de 100 et 80 px, avec une police de 9 px. L’infobulle au survol était le seul accès au texte intégral.

## Nouvel affichage

- Un bouton visible « 📝 Besoins / notes (n) » signale les articles renseignés sur la ligne de commande, même lorsque les articles sont repliés. Il permet de déplier/replier la commande au clavier, au clic ou au toucher.
- Le compteur porte sur les articles affichables selon le filtre d’articles courant.
- Sous chaque article renseigné, une ligne couvrant les 11 colonnes contient des blocs identifiés **Besoin client** et **Note commerciale**.
- Les textes sont affichés intégralement et automatiquement lorsque les articles sont dépliés : aucune infobulle, aucun « voir plus », aucune limite de lignes ou de hauteur.
- Police de 13 px, interligne augmenté, sauts de ligne et espaces conservés, coupure possible des références très longues sans espace.
- Deux blocs côte à côte sur grand écran, empilés sur petit écran. Un champ seul utilise toute la largeur disponible.
- Les anciennes cellules deviennent des liens explicites vers les blocs correspondants, utilisables au clavier et au toucher.
- Le fond et le repère des champs modifiés sont conservés, dans les cellules et sur le contenu intégral. Les couleurs des autres champs et les états des articles restent inchangés.
- La recherche du tableau retrouve également les mots contenus dans les besoins et notes et les surligne dans les blocs.
- La fiche commande mobile affiche les mêmes blocs en lecture seule, sous les informations de l’article.

Aucune modification de données, de permissions, de cumuls, de filtre d’état ou de schéma. Le texte est rendu comme texte React, sans interprétation de HTML.

## Vérifications

Tests de composants : textes de plusieurs milliers de caractères, conservation des sauts de ligne, largeur de ligne et alignement des 11 colonnes, neutralisation du `nowrap` mobile, liens vers le bon article, champs vides, références sans espace, texte ressemblant à du HTML, champs modifiés et surbrillance de recherche.

Vérification manuelle recommandée sur les navigateurs des utilisateurs : déplier une commande avec plusieurs articles, lire et sélectionner une consigne longue, naviguer au clavier via les liens, puis vérifier le même affichage sur smartphone. Les tests DOM ne mesurent pas la mise en page réelle d’un navigateur.
