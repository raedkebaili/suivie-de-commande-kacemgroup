# Regroupement classique + synthèse matière indépendante

## Organisation corrigée

Dans **Commandes**, les regroupements classiques sont rétablis **au-dessus**, avec un tableau séparé pour chaque groupe comme avant :

- Groupe par sous-famille / variante, reconnaissance manuelle prioritaire conservée.
- Repli indépendant, répartition par puissance et sous-totaux.
- Colonnes Article, Puissance, Famille, Commandé, Affaire, Client, N° Cmd, Produit, Livré, Reste à livrer.
- Compteurs et export Excel classiques rétablis.

**À la fin**, une section distincte affiche **Synthèse du besoin par catégorie et référence matière** : Catégorie, Référence, Matière et Besoin en unités. Aucun tableau unique d'articles avec des colonnes techniques ne remplace les regroupements classiques.

## Calcul

Règle confirmée : **une unité de chaque matière sélectionnée par article commandé**. Exemple : 100 articles avec driver DX et lentille LX → 100 DX et 100 LX. Deux références différentes d'une catégorie ne sont jamais confondues ; les doublons d'une même sélection sont dédupliqués sur une ligne.

- Besoin brut : pas de déduction du stock, de la production, des livraisons ou des achats.
- Toutes les catégories ayant des matières renseignées sont couvertes, y compris les références historiques. L'ancienne configuration des colonnes techniques ne peut plus cacher une matière de la synthèse.
- Les snapshots des spécifications sont conservés même si une matière est ensuite désactivée.
- Une ancienne saisie textuelle non vide est une sélection unique, non découpée arbitrairement aux virgules, signalée « ancienne saisie à vérifier ». Les composants dynamiques priment sur le texte ancien de la même catégorie.
- Une catégorie non renseignée n'est pas un zéro. Les lignes sources manquantes sont indiquées sur le sous-total de la catégorie ; « + ? » signifie que le besoin reste partiel.
- Les catégories de caractéristiques (couleur, classe électrique…) comptent des occurrences de spécification ; elles ne correspondent pas forcément à des pièces à acheter.

## Recherches, filtres et tri propres à la synthèse

Filtres directs sur les **matières agrégées** :

- Recherche par référence ou désignation (insensible aux accents / casse).
- Catégorie matière.
- Besoin minimum et maximum, appliqués après agrégation.
- Tri des matières dans chaque catégorie : référence, désignation ou besoin numérique, croissant ou décroissant.

Le bouton **Filtrer les articles sources** ouvre des filtres supplémentaires : articles, familles, puissances, clients et commandes (choix multiples), affaire, dates, quantités et spécifications techniques renseignées / manquantes ou contenant un texte.

Les valeurs d'une même liste s'appliquent par OU ; les filtres différents par ET. Le statut / agence / priorité du tableau Commandes, ainsi que les droits d'accès aux agences, s'appliquent aux deux sections. En revanche :

- Rechercher ou filtrer dans la synthèse **ne modifie pas et ne recharge pas** les tableaux classiques au-dessus.
- La recherche classique ne modifie pas la synthèse.
- Une erreur de la synthèse ne masque pas les regroupements.
- Les sous-totaux de synthèse portent uniquement sur les références affichées après filtrage.

**Exporter la synthèse** produit les feuilles Besoin par matière, Totaux catégories et Règles de calcul, avec les mêmes filtres et le même ordre que la synthèse. L'export classique reste séparé et conserve les informations de production / livraison.

## Défilement du bureau

Le conteneur `.desktop-app-shell` est ancré au viewport (hauteur dynamique `100dvh`, repli `100vh`), au lieu de laisser une longue liste de tableaux entraîner le document entier.

- La colonne de contenu et `main` ont une hauteur minimale nulle dans le flex ; seul `main` fait défiler les tableaux.
- Le menu latéral occupe la hauteur disponible. Sa navigation possède son propre défilement ; logo et pied de menu / déconnexion ne se rétractent pas.
- `overscroll-contain` empêche la propagation du défilement en fin de liste.
- La version mobile autonome n'est pas modifiée. Les règles d'impression rétablissent un flux normal, sans tronquer les tableaux.

## Validation

Tests de régression : tableaux distincts et ordre avant la synthèse, colonnes classiques et repli, filtres de synthèse indépendants, erreur isolée, calculs / agrégation / filtres, prise en compte de toutes les catégories malgré une ancienne configuration vide, cohérence JSON / Excel, authentification et périmètre agence.

Test de défilement exécuté dans Chromium sur une fixture utilisant les vrais composants et le CSS compilé : 20 groupes, 600 lignes d'articles, 100 références matière, fenêtres de 1440×800 et 1440×480. Au bas de `main` (plus de 25 000 px défilés), la barre latérale reste entre 0 et la hauteur du viewport, la déconnexion reste visible, le document ne défile pas et le menu réduit garde sa largeur de 70 px. Cette fixture ne remplace pas une recette sur la base de production.

## Colonnes classiques : réglage partagé par l’administrateur système

Le bouton **Colonnes — affichage pour tous**, réservé au rôle `superadmin`, permet de cocher / décocher chacune des dix colonnes : Article, Puissance, Famille, Commandé, Affaire, Client, N° Cmd, Produit, Livré, Reste à livrer. **Tout afficher**, **Tout masquer**, **Enregistrer pour tous** et **Annuler** sont disponibles. Les changements restent un brouillon tant qu'ils ne sont pas enregistrés.

- Configuration persistée dans `system_settings.article_grouping_visible_columns`, indépendante de l'ancienne sélection de catégories techniques. Aucune migration requise ; le paramètre est inclus dans les sauvegardes existantes.
- Tous les utilisateurs authentifiés lisent la même règle ; seule l'API d'écriture Super Admin peut la modifier. Aucun réglage propre au navigateur ou à l'utilisateur ne la remplace.
- Synchronisation légère de la configuration toutes les 30 secondes lorsque la page est visible, ainsi qu'au retour sur la page / au focus. Pas de rechargement des commandes à chaque vérification.
- Par défaut ou si le paramètre stocké est invalide, toutes les colonnes classiques restent visibles. Une liste vide est un choix valide : les groupes restent présents avec une indication que leurs colonnes sont masquées, et l'admin peut toujours les réafficher.
- En-têtes, cellules et sous-totaux restent alignés pour chaque combinaison. Les compteurs récapitulatifs correspondant aux colonnes masquées sont également masqués ; la répartition par puissance disparaît si Puissance est masquée.
- L'export classique applique la même règle aux détails et aux totaux par groupe. Les métadonnées de regroupement restent présentes dans Excel ; les anciennes colonnes supplémentaires Date / État Production ne sont pas des colonnes sélectionnables et ne figurent plus dans cet export configurable. Si tout est masqué, aucun tableau vide n'est exporté.
- La synthèse matière sous les regroupements et son export restent entièrement indépendants.

Ce réglage est une préférence d'affichage partagée, **pas un mécanisme de confidentialité** : il ne retire aucun droit de lecture sur les données des commandes.
