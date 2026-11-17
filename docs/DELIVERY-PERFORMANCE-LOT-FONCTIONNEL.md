# DPM — lot fonctionnel analytique

## Portée réelle

Ce lot ne livre PAS encore l'ensemble du module demandé. Il réutilise la fondation et ajoute du code fonctionnel : moteur ouvré, lecture PostgreSQL sécurisée, tableau de bord dans l'application et export Excel. Aucun écran opérationnel complet de saisie des engagements/livraisons/réceptions/événements/impacts/actions 5M n'est encore livré. Les services serveur de décisions de la fondation restent disponibles, mais ne constituent pas ces parcours de saisie.

La demande actuelle autorise la poursuite au-delà de la phase 2 et envisage une migration contrôlée sur la base actuelle, sous sauvegarde vérifiée. Les garde-fous de migration restent applicables : pas de connexion DATABASE_URL fournie à cette session, pas de sauvegarde réelle vérifiée, écarts historiques non levés. **Aucune migration exécutée sur une base actuelle ou de production.** Vercel est signalé déconnecté par le connecteur ; aucun déploiement direct ne peut être revendiqué.

## Implémentation de ce lot

- `src/lib/dpm-performance.ts` : calculs purs, dates civiles contrôlées, fuseau Africa/Tunis, intervalles ]échéance, fin], exceptions par version de calendrier, achèvement par acceptation de chaque article. Une surquantité d'un article ne compense pas un autre.
- Retard brut : nombre de jours ouvrés après l'échéance, à la complétion acceptée ou à la date d'observation pour une ouverte.
- Retard maîtrisable/net : brut moins l'union des fenêtres résiduelles prouvées et approuvées, pondérées par les horaires réellement configurés. Les fenêtres simultanées sont unionnées conservativement, même sur plusieurs chemins. Une autorisation partielle sans fenêtre précise entièrement couverte par les minutes approuvées n'est PAS interpolée ; elle n'est pas déduite. Les impacts après l'instant de complétion ne sont pas déduits.
- KPI TRB, TRM, OTD, OTIF, moyens brut/net, partielles et backlog ouvré. Moyens incluant les ouvertes ayant un retard positif. Les populations distinctes de TRB/TRM sont expliquées dans l'interface ; N/A pour dénominateur nul.
- `src/lib/dpm-report.ts` : lecture transactionnelle repeatable-read des commandes/articles/clients existants, engagements, décisions, calendriers publiés, réceptions, événements/impacts. Pas de duplication des commandes.
- Qualification conservatoire : calendrier non publié ou exception non validée, quantités contractuelles différentes des quantités actuelles, réception dépassant le cumul expédié actuel, annulation non documentée => commande exclue et raison visible uniquement dans le périmètre autorisé. Les commandes sans engagement approuvé ne sont pas inventées dans la population DPM.
- Lecture exigeant READ explicite, sans privilège industriel implicite du rôle superadmin. Une commande multisite n'est renvoyée qu'à un lecteur autorisé sur tous ses sites de livraison/fabrication/impacts connus. Le périmètre agence existant reste appliqué.
- `GET /api/dpm/performance` : bornes de période et filtre usine, contrôle d'accès, erreurs sans KPI de remplacement, cache privé no-store.
- `src/components/DpmView.tsx`, `src/app/page.tsx`, `src/components/Sidebar.tsx` : onglet Delivery Performance, cartes, commandes, détail des exclusions, consolidation par usine (populations non additives), sélection de la semaine précédente lundi–dimanche, export Excel de la vue calculée et des exclusions.

## Tests réellement exécutés avant commit

- TypeScript : réussi.
- ESLint : réussi.
- **525 tests réussis, 73 fichiers.**
- **18 scénarios KPI**, dans `dpm-performance.test.ts` : à temps, en retard, anticipée, ouverte échue/non échue, partielle à temps/tardive, solde tardif, impact externe approuvé/non approuvé, panne interne non automatiquement excusée, chevauchement, échéance contractuelle révisée, annulation, articles multisites sans compensation, dimanche/exception, événement multi-commandes, dénominateurs nuls.
- `dpm-report-api.test.ts` : fermeture par défaut, refus sans authentification/grant explicite, vraie lecture sur PGlite avec soumission approuvée par décision séparée et réception acceptée, période invalide, isolement d'un autre site et absence de fuite des exclusions.
- Tous les tests antérieurs de sauvegarde/restauration, protections, workflow, fonctions opérationnelles et UI existante sont réexécutés dans la suite complète.
- Build Next.js : réussi. Pas de vérification navigateur ou de production revendiquée.

Les données de test sont synthétiques. Les fixtures HTTP alignent explicitement deux colonnes historiques manquantes du replay SQL, comme documenté dans le rapport de phase 2. Cela ne valide pas une migration sur la base réelle.

## Activation future — après sauvegarde et recette, pas maintenant

Les valeurs de `.env.example` restent **false** :
- `DPM_ENABLED` : API de lecture.
- `NEXT_PUBLIC_DPM_ENABLED` : visibilité du menu (nécessite un build).
- `DPM_CONFIGURATION_ENABLED` : configuration des correspondances et des grants.

Le build n'applique aucune migration. Le projet 0007 reste hors journal de déploiement en attendant contrôle de l'état réel. Ne pas utiliser drizzle-kit push et ne pas définir ces variables pour simuler une validation de schéma.

## Parcours de recette prévu sur une copie approuvée

1. Sauvegarde vérifiée et comparaison du schéma réel ; lever les écarts `order_items.reference` et `photometric_study_items.order_item_id` et vérifier les defaults/contraintes/journaux sans réparation automatique implicite.
2. Migration SQL additive contrôlée et restauration vérifiée sur copie, selon `DELIVERY-PERFORMANCE-RECETTE-PHASE2.md`.
3. Configurer explicitement les quatre usines et habilitations ; aucun rapprochement ni grant automatique. Publier des calendriers avec horaires et exceptions validés.
4. Après autorisation d'activation et build approprié : ouvrir **Delivery Performance** dans le menu d'Order Track Pro. L'interface de configuration est `/delivery-performance/setup`.
5. Sélectionner une période puis Actualiser. Sans faits contractuels/acceptations qualifiés : aucun chiffre fictif, N/A sur populations vides.
6. Sur jeux de recette approuvés : vérifier commande complète à temps => OTD/OTIF ; partielle => pas de complétion ; réception finale tardive => brut positif ; impact non approuvé => aucune déduction ; impacts simultanés approuvés => pas de double déduction.
7. Tester les quatre périmètres READ, les exclusions et le téléchargement Excel. Choisir Semaine précédente puis Actualiser pour un export hebdomadaire de la population d'échéances.

La saisie de ces faits n'a PAS encore de parcours opérateur complet dans ce lot : ne pas demander à l'utilisateur de saisir du SQL sur sa base actuelle pour compenser ce manque.

## Limites et suite indispensable

- Module complet non livré : écrans/API métier de saisie, réceptions/corrections et intégration aux lots existants, déclaration des événements et preuves, parcours des cinq revues et analyse d'impact, actions 5M, jalons/transferts, rapport hebdomadaire narratif et tendances à terminer.
- Le tableau expose la performance par commande et les acceptations par article, pas encore les retards individualisés par article/livraison. Filtre usine par identifiant technique, pas encore le sélecteur ergonomique des quatre codes. Pas encore de filtres famille/client dédiés.
- L'export hebdomadaire est un export de la vue sur semaine choisie, pas encore le rapport complet causes/risques/actions.
- Vercel doit être reconnecté dans Arena. Aucune clé ou mot de passe n'est demandé dans le chat. Les statuts GitHub du commit poussé sont vérifiés séparément ; un push ne prouve ni déploiement ni migration.
- Une publication GitHub est effectuée sur la branche de session `arena/6634504f-suivie-de-commande-kacemgroup`. Le travail de cette session ne peut pas être poussé directement sur `main`.

**Ne pas présenter ce lot comme un module complet, déployé ou prêt à tester sur la base actuelle.**
