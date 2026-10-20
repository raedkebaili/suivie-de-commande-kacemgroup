# Regroupement par article : besoin matière

## Usage

Dans **Commandes → Regroupement par Article · Besoin matière**, les informations de production / livraison sont remplacées par :

**Article · Puissance · Famille · Commandé · Affaire / besoin · Client · N° Cmd · catégories techniques choisies · Total de chaque catégorie.**

La reconnaissance des articles, la puissance et la priorité des affectations manuelles au catalogue sont conservées. Chaque ligne correspond à un article de commande : deux articles de même désignation ayant des spécifications différentes ne sont jamais fusionnés arbitrairement.

### Choix des colonnes par l'administrateur système

Cliquer **Configurer les catégories** : cocher les catégories (PCB, Driver, Lentille, catégories personnalisées…), ajuster leur ordre avec les flèches et **Enregistrer pour tous**.

- Configuration commune aux utilisateurs et persistée dans `system_settings.article_grouping_categories` ; aucune migration supplémentaire nécessaire.
- Modification protégée côté serveur, réservée au rôle `superadmin`. Les autres rôles peuvent consulter et filtrer, pas changer ce paramétrage.
- Une sélection vide est autorisée et ne réactive pas automatiquement les valeurs par défaut.
- Sans configuration enregistrée : catégories actives par défaut. Les catégories inactives / historiques restent disponibles à la sélection.
- La configuration est incluse dans les sauvegardes existantes via `systemSettings`.

## Calcul validé

**Une matière sélectionnée = une unité par article commandé.**

Exemple :

| Commandé | Spécification Driver | Total Driver |
|---:|---|---:|
| 100 | DX — Driver X | 100 |
| 20 | DY — Driver Y | 20 |
| 10 | Non renseigné | ? |

Le total de catégorie est **120 + ? (1 ligne)**. La synthèse distingue DX = 100 et DY = 20, et n'assimile pas une spécification absente à un besoin nul. Si deux matières différentes d'une même catégorie sont sélectionnées pour 100 articles, cette catégorie totalise 200 unités, réparties entre les deux références.

- Besoin **brut**, sans déduction du stock, de la production, des livraisons ni des achats déjà engagés.
- Doublons techniques d'une même matière sur une même ligne dédupliqués.
- Quantité zéro avec spécification = 0 ; catégorie non renseignée = inconnu.
- Les références / noms sont ceux des spécifications techniques enregistrées (snapshots), même si la matière a ensuite été désactivée.
- Pour les anciens champs techniques textuels de l'article, un texte non vide est compté comme **une seule sélection à vérifier**, sans découpage des virgules. La sélection dynamique prime sur cet ancien texte pour la même catégorie. Ces reprises sont explicitement signalées dans l'interface et l'export.
- Certaines catégories sont des caractéristiques (température de couleur, classe électrique…). Leurs totaux comptent des occurrences de spécification ; ce ne sont pas forcément des composants à acheter.

## Filtres et tri

Les filtres statut / agence / priorité du tableau Commandes sont conservés, de même que le périmètre d'accès aux agences autorisées. Le besoin peut donc inclure d'anciennes commandes si aucun filtre de statut n'est appliqué.

Filtres du regroupement :

- Recherche sans distinction d'accents / casse : article, sous-famille, famille, affaire, client, commande, références et désignations techniques visibles.
- Choix multiples d'articles, familles, puissances (y compris inconnues), clients et numéros de commande.
- Affaire / besoin, plage de dates de commande et plage de quantités commandées.
- Catégories visibles toutes renseignées ou au moins une manquante.
- Pour chaque catégorie : référence / désignation contenant un texte, catégorie renseignée ou non renseignée.

Les valeurs d'un filtre multiple s'appliquent par **OU** ; les filtres différents par **ET**. Ctrl/Cmd + clic permet la multisélection dans les listes. Le bouton de réinitialisation ne modifie pas les filtres du tableau Commandes.

Jusqu'à **trois tris ordonnés**, croissants ou décroissants : article, puissance, famille, commandé, affaire, client, commande, date, spécification ou total d'une catégorie visible. Comparaisons numériques pour les quantités / puissances / besoins ; les valeurs inconnues sont placées à la fin.

Les compteurs, totaux et synthèses sont recalculés sur **les seules lignes filtrées**, pas sur le jeu complet avant filtrage. La pagination de 50 / 100 / 250 lignes ne limite pas les totaux.

## Export Excel

Le bouton exporte **toutes les lignes filtrées**, dans le même ordre, avec les mêmes catégories visibles. Les champs de spécification sont préfixés « Spécification » dans Excel pour éviter qu'une catégorie nommée « Article » écrase une colonne fixe.

Feuilles :

1. **Détail par article** : colonnes techniques, besoins par ligne, sous-famille / variante et date de commande, sans les anciens compteurs produit / livré.
2. **Besoin par matière** : synthèse catégorie / référence / désignation et unités requises connues.
3. **Totaux catégories** : besoins connus et nombre de lignes non renseignées.
4. **Règles de calcul** : hypothèse une unité, traitement des manquants, anciennes saisies et périmètre.

## Validation

Tests couvrant les calculs, références distinctes, doublons, quantités nulles, manquants, anciennes spécifications, filtres combinés, tris numériques, configuration partagée / vide / ordonnée, droits admin, périmètre agence, affichage et cohérence JSON / Excel. Validation statique TypeScript, lint et build Next.js.

Les tests API utilisent une base simulée : une recette sur données réelles reste nécessaire, notamment pour valider les anciennes spécifications textuelles avec les responsables techniques.
