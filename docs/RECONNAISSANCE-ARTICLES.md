# Reconnaissance des articles dans le regroupement

Le tableau et le référentiel administrateur utilisent maintenant le même moteur, avec le catalogue complet défini dans **Familles d’articles**.

- Une affectation manuelle reste prioritaire (les différences de casse, accents et espaces sont tolérées).
- Sans affectation, les sous-familles et variantes du catalogue sont recherchées dans la désignation complète. Les nouveaux articles ne nécessitent pas d’affectation individuelle si leur modèle est identifiable.
- Les désignations à plusieurs mots, variantes romaines, génération décimale, « + », espaces et tirets sont pris en charge. La variante la plus spécifique est retenue ; un simple préfixe ne permet pas de fusionner deux modèles différents.
- Plusieurs modèles distincts dans la même désignation restent à classifier. Il n’y a pas de correction approximative des noms (ex. APOLO et APOLLO ne sont pas considérés comme des synonymes).
- La reconnaissance stricte historique reste le repli pour les modèles non présents au catalogue. Leur catégorie est indiquée comme non définie, jamais inventée.

## Puissances

Les unités W, watt(s), kW, les décimales (point/virgule) et les multiplicateurs explicites (ex. `2x50W` → 100 W) sont lus indépendamment des autres caractéristiques. Tension, température de couleur, hauteur, IP et fréquence ne sont pas considérées comme des puissances. Les plages et plusieurs puissances distinctes restent sans puissance unique. Les modèles courts historiques et les suffixes numériques non ambigus des modèles du catalogue restent pris en charge.

## Affichage et export

La colonne **Famille** affiche la catégorie du catalogue, par exemple **LUMINAIRE D'ECLAIRAGE PUBLIQUE**. Les groupes restent organisés par sous-famille et variante afin de ne pas fusionner tous les luminaires d’une même catégorie. L’origine Auto/Manuel reste une information de l’en-tête du groupe, pas le contenu de la colonne Famille.

Les exports Excel détaillé et synthétique incluent la catégorie et la sous-famille/variante. Le détail inclut également la puissance en watts. Les noms d’articles et les quantités ne sont pas modifiés.

Après une modification du catalogue, actualiser le regroupement pour relire le catalogue courant. Aucun accès à une base de production n’a été nécessaire pour développer les règles ; les tests utilisent des données et API simulées.
