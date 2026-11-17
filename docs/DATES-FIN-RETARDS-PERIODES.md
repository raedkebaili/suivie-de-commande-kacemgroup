# Dates de fin, statistiques de retard et périodes des commandes

## Dates réellement enregistrées

Les bilans globaux de production et d’expédition affichent la date de production complète et/ou de livraison totale de l’article. Les modes toutes dates des deux plannings et les cartes mobiles reprennent cette information. La ligne jaune d’une commande indique sa date de fin de production, à côté de « En attente de livraison ».

Le calcul s’appuie sur les journaux complets `production_batches` et `expedition_batches` :

1. Chaque article est vérifié séparément par rapport à sa quantité commandée actuelle, sans compensation entre articles.
2. Les mouvements sont ordonnés par `created_at`, puis `id`. Les quantités signées incluent les corrections et retours arrière.
3. La date retenue est celle de l’enregistrement du dernier mouvement faisant franchir le seuil de quantité complète. Un supplément ultérieur ne décale pas cette date. Une correction sous le seuil retire la date ; une nouvelle application donne une nouvelle fin.
4. Le solde du journal doit correspondre au cumul courant. En cas d’import ancien sans journal suffisant, de quantité incomplète ou de journal incohérent, la date reste non disponible.
5. La commande entière est terminée uniquement si chaque article de quantité positive possède une fin vérifiable ; sa date est la dernière de ces dates.

La date affichée est le **jour serveur d’enregistrement du mouvement**, pas la date prévue du planning, ni une heure de fin physique que le système n’a pas observée. Cette distinction est importante : une application de production peut conserver `production_date = plan_date`, y compris une date ancienne. Aucun mouvement historique n’est réécrit. Une modification ultérieure de quantité commandée entraîne une nouvelle lecture du seuil actuel : ces dates ne sont pas un historique des anciennes quantités contractuelles.

Les journaux ne sont pas soumis à la limite de 500 lots des écrans opérationnels pour ce calcul.

## Calculateur de retard

Nouveau bloc au tableau de bord, en lecture seule :

- deux délais cibles réglables, en jours calendaires : production complète et livraison totale ;
- départ commun : **date de commande saisie par le commercial** (`orders.order_date`) ;
- fin production : date de production complète de la commande ; fin expédition : date de livraison totale de la commande ;
- taux = commandes terminées au-delà du délai cible / commandes terminées avec dates vérifiables × 100 ;
- une durée égale au délai cible est à l’heure ; zéro jour est un seuil explicitement autorisé ;
- les commandes ouvertes dépassant le délai sont indiquées séparément et ne sont pas mélangées au dénominateur des commandes terminées ;
- les dates inconnues, antérieures à l’entrée, futures ou incohérentes ne deviennent jamais artificiellement des commandes à l’heure ;
- aucun seuil arbitraire par défaut : sans cible renseignée, durées moyennes disponibles, taux « Non calculable » ;
- seules les commandes Bon de commande / Sur stock non annulées sont étudiées. Les prévisions ne sont pas des engagements de production ;
- les paramètres de simulation sont locaux au bloc, sans écriture de réglages globaux ni changement de droits.

Les résultats sont disponibles au total, pour une usine, ou sous forme de comparaison des usines. L’usine provient de l’unité de production actuelle de l’article, avec repli sur son dernier planning de production non annulé. Les articles sans usine sont identifiés comme « Non affectée ».

Une commande multi-usines appartient à chaque usine concernée mais une seule fois au total. Même dans un groupe usine, sa durée va jusqu’à la fin de **toute la commande** : on ne présente pas la livraison du seul sous-ensemble comme une livraison totale. Les groupes ne sont donc pas additionnables. Le tableau numérique sous le diagramme donne les dénominateurs, les moyennes, les ouvertes hors délai et les dates inconnues.

Les périmètres agence existants sont appliqués sur le serveur avant calcul, y compris pour les comptes sans agence autorisée.

## Filtre de période

Le tableau des commandes propose « Toutes les dates », « Par année », « Par mois » et une période personnalisée avec calendriers de début et fin. Le filtre ne change qu’après « Appliquer la période » ; « Toutes les dates » le réinitialise. La période appliquée est affichée explicitement.

Les bornes sont inclusives et portent sur la date de commande commerciale, non sur sa date technique de création. Les années bissextiles sont prises en charge. Les dates impossibles et périodes inversées sont refusées côté interface et API.

Les mêmes bornes sont transmises à l’export Excel, aux regroupements classiques et au besoin matière associé, en complément des filtres et périmètres existants. Les paramètres sont `orderFrom` et `orderTo`. Aucune modification des quantités ou de l’éligibilité matière n’est introduite.

## Vérifications

Tests SQL réels sur PGlite : franchissement de seuil en plusieurs lots, suppléments, annulations et réapplications signées, journal incomplet, commande multi-articles, dates réellement enregistrées distinctes des dates prévues. Tests API : dates dans les deux plannings et Commandes, bornes inclusives identiques dans les exports/regroupements, seuils invalides, authentification et restrictions agence. Tests UI : calendriers, application volontaire, absence de taux inventé, diagramme et choix usine, affichage des dates dans le bilan.

Aucune migration de schéma ni logique d’écriture de quantités modifiée. Les tests embarqués ne constituent pas une validation de concurrence multi-connexion ou une mesure de performance sur la base de production.
