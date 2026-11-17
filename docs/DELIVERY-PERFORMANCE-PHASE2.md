# DPM — dernière itération de sécurisation de la phase 2

## Décision de livraison

**PHASE 2 NON VALIDÉE. Phase 3 non commencée.**

Aucune connexion à la production, migration 0007 en production, commande drizzle-kit push, activation du module ni modification d'identifiants historiques. Les interfaces de configuration et le diagnostic Drive restent fermés par défaut (`DPM_CONFIGURATION_ENABLED` non défini par ce travail). Les services de décisions ne sont pas exposés comme fonctionnalités métier actives.

## Tableau de suivi des six verrous

| Verrou | État | Modifications effectuées | Tests réellement exécutés | Limites et risques avant déploiement |
|---|---|---|---|---|
| 1. Sauvegarde/restauration | **Partiellement résolu** | Sauvegarde de **52 collections non vides dans la fixture** : 36 métier + 16 DPM. Décisions terminales ajoutées au contrat. Ordonnancement par dépendances pour les révisions/corrections, pas seulement par id ; ordre des cinq revues. Import des calendriers en brouillon, exceptions, puis republication avec métadonnées d'origine. Séquences jamais abaissées. Refus d'écrasement d'un historique DPM existant conservé. | Véritables handlers HTTP GET/POST invoqués en processus avec NextRequest/NextResponse et PostgreSQL PGlite : export, import, comparaison de toutes les collections, mots de passe réinitialisés selon contrat existant, quantités/documents/journaux, toutes les séquences à id. FK invalide en toute fin d'import : rollback et comparaison au contenu antérieur. Exception simulant une interruption au milieu des insertions : compte sentinelle conservé et aucune commande partielle. | Pas de test réseau via serveur Next ni de coupure réelle de connexion/processus. PGlite ne remplace pas PostgreSQL déployé. Les séquences PostgreSQL ne sont pas transactionnelles : des trous après échec sont possibles, sans ligne partielle ; ne jamais les réinitialiser vers le bas. Les fixtures corrigent explicitement deux écarts de schéma historique uniquement dans le montage de test, voir verrou 6. |
| 2. Workflow des décisions | **Partiellement résolu** | Soumissions d'engagements immuables PENDING, décisions terminales dans `dpm_commitment_decisions` sans modification de la soumission, approbation/rejet motivés avec auteur/date/preuve et audit. Site d'approbation figé sur la soumission. Corrections par nouvelles versions conservant la date initiale. Revues des cinq fonctions, corrections d'événements reliées à l'ancien événement et nouvelle version. Transactions/verrou commun aux décisions, grants, sauvegardes et mutations Drive. | Deux acteurs tentent des décisions opposées via Promise.allSettled : une seule terminale ; UPDATE de décision refusé. Soumission corrigée : date initiale préservée, version et auteur conservés. Correction événement : ancienne chaîne de cinq revues intacte ; vérification technique refusée à un déclarant non habilité. Tests antérieurs d'immutabilité, versions, quantités et séquence des étapes conservés. | Les transactions PGlite sont sérialisées sur un seul client : **pas une démonstration de concurrence PostgreSQL multi-connexions**. Services non exposés par une API métier active ; toute future exposition doit reprendre authentification, périmètre de commande/multisite et identité serveur. Les corrections opérationnelles ultérieures des journaux existants après réception demandent encore une recette de concurrence dédiée. |
| 3. Habilitations | **Partiellement résolu** | Interface d'administration ajoutée à la page de rapprochement : utilisateur, site rapproché, fonction indépendante, attribution/révocation et motif. API réservée au superadmin, validation serveur, audit transactionnel avant/après. Aucun grant automatique ; le rôle superadmin ne vaut pas approbation industrielle. Helper vérifiant aussi que le compte est actif. | Appels des handlers : non-admin refusé, site inexistant refusé, attribution/révocation autorisées et journalisées. READ sur KER-02 ne donne ni READ sur KER-01/AGU-01/AGU-02 ni INDUSTRIAL_APPROVAL. Tests de fermeture par défaut conservés. | Recette navigateur et matrice réelle comptes/sites à fournir. L'écran attribue des droits par site seulement ; publication des calendriers partagés exige CONFIGURE global explicite et diagnostic global des preuves exige READ global explicite. Leur amorçage/délégation n'est pas ajouté implicitement au rôle superadmin et reste à approuver. |
| 4. Protection des preuves | **Partiellement résolu** | Blocage général remplacé par un contrôle des fichiers réellement associés et de leurs ancêtres Drive. Suppression/renommage/déplacement d'un fichier sans lien à une preuve autorisés. Contrôle READ sur tous les sites liés à une preuve ; rattachement inconnu : global explicite requis. Filtrage listes/recherche/documents contextuels/statistiques, contrôle téléchargement. Preuves des décisions et revues également protégées. Diagnostic d'existence Drive ajouté, fermé par défaut. | Handlers de suppression simulés avec client Drive de test : preuve et parent refusés, fichier ordinaire supprimé seul. Liste de métadonnées filtrée ; téléchargement non habilité retourne 403 avant lecture du contenu. Adaptateur Drive simulé : statut present puis missing_or_inaccessible. Protection SQL d'une association de preuve testée et conservée après restauration. | **Aucun accès Drive réel ni vérification réelle de fichiers restaurés.** Scénarios multi-sessions association/suppression à terminer ; un document déjà supprimé physiquement avant sa première association comme preuve doit être revalidé par le futur flux d'association. Accès/partages hors application non contrôlés par ces routes. Si l'arborescence d'une preuve n'est pas vérifiable, l'opération échoue fermé, même pour une cible potentiellement sans lien. Sauvegardes globales de récupération réservées au superadmin, distinctes des exports métier par site. |
| 5. Calendriers | **Résolu** *(mécanisme local démontré)* | Contenu d'une version immuable dès sa création ; modification de règles = nouvelle version. Publication unique avec auteur/date/motif ; aucune modification ni suppression d'une version publiée. Exceptions append-only rattachées par FK à une version précise, ajout impossible après publication. TRUNCATE protégé. Publication refuse l'absence de plages explicites pour un jour travaillé. Journal avant/après à la publication par service. Aucun jour férié ou horaire réel inventé. | Publication autorisée uniquement après CONFIGURE global explicite ; modification de version publiée et ajout/suppression d'exception refusés. Données de publication et audit vérifiés. Horaires invalides, chevauchements et jours invalides rejetés dans les tests existants. Calendrier publié et exception non vide préservés par la restauration HTTP. | Les horaires présents dans la fixture sont synthétiques, pas une configuration tunisienne validée. Les calendriers opérationnels et sources de jours fériés doivent être fournis/validés. Recette sur la version PostgreSQL cible encore requise au verrou 6. |
| 6. Migration représentative | **Bloqué** | Procédure de recette précise et outil de snapshot/comparaison **en lecture seule**. Inventaire des migrations 0000–0007, protections SQL et différences avant/après prévu. Migration 0007 demeure préparatoire, hors journal définitif de déploiement. | 0000–0007 exécutées en PGlite dans les tests ; syntaxe du script Node vérifiée. Deux écarts historiques révélés et consignés. **Script non exécuté sur copie réelle** ; aucun résultat de recette représentative revendiqué. | Copie anonymisée, version/permissions PostgreSQL et journal réel indisponibles. Les migrations 0000–0006 omettent `order_items.reference` et `photometric_study_items.order_item_id`, attendus par le modèle actuel. La fixture HTTP ajoute ces deux colonnes et la FK de la seconde explicitement, sans modifier les migrations historiques ni 0007 pour les réparer. Défaut `notifications.type` également différent entre baseline et modèle. Ces écarts doivent être établis/expliqués sur copie réelle avant toute migration. |

## Résultats des vérifications

- **TypeScript : réussi.**
- **ESLint : réussi.**
- **Suite complète : 504 tests réussis, 71 fichiers.**
- **Build Next.js final : réussi.**
- **`node --check scripts/dpm-rehearsal-audit.mjs` : réussi.** Aucun lancement de snapshot contre une base réelle.
- Après le dernier complément de FK dans la fixture historique : nouvelle exécution ciblée HTTP + cycle de vie, **12 tests réussis, 2 fichiers**, puis suite complète/typecheck/lint/build réexécutés.
- **`git diff --check` final : réussi.**

Logs locaux : `/home/user/dpm-last-tests-final.log`, `/home/user/dpm-last-build-final.log`, `/home/user/dpm-last-http-final.log`. Les erreurs FK et interruption présentes dans les logs HTTP sont des injections attendues, avec assertions de rollback réussies.

### Nature exacte des nouveaux tests

- `dpm-backup-http.test.ts` : 3 tests, toutes les collections exportées non vides. Les handlers réels sont appelés, seule l'authentification, le collecteur de logs hors transaction et la connexion à la base de test sont adaptés. La logique de restauration et les contraintes SQL ne sont pas mockées. L'interruption est une exception injectée, pas un crash réseau réel.
- `dpm-lifecycle.test.ts` : 9 tests, grants/révocation/isolement des quatre sites, décisions concurrentes sur client unique, corrections/soumissions, tri des dépendances/cycle refusé, publication, suppressions physiques simulées, métadonnées/téléchargements et diagnostic Drive simulé.
- Tests de fondation, sécurité, fermeture de l'API et collecte des sauvegardes antérieurs conservés et réexécutés. Le test de mutation d'un calendrier brouillon a été renforcé : même un brouillon ne réécrit plus son contenu, il faut une nouvelle version.
- Fixture des 52 collections : données synthétiques uniquement. Ce jeu n'est ni une copie anonymisée réelle, ni une preuve de représentativité.

## Fichiers de cette itération

### Données et migration préparatoire
- `src/db/schema.ts` : site d'approbation de soumission, correction d'événement, métadonnées de publication, décisions terminales.
- `drizzle/0007_delivery_performance_foundation.sql` : table/contraintes/triggers supplémentaires. Aucun changement aux migrations 0000–0006.
- `src/lib/dpm-backup.ts` : 16 tables DPM, ordre de dépendances, publication après exceptions, séquences monotones.
- `src/app/api/backup/route.ts` : séquences monotones des tables métier, transaction existante conservée.

### Services et habilitations
- `src/lib/dpm-decisions.ts`
- `src/lib/dpm-access.ts`
- `src/app/api/dpm/grants/route.ts`
- `src/app/delivery-performance/setup/grants.tsx`
- `src/app/delivery-performance/setup/site-mapping.tsx`

### Preuves
- `src/lib/dpm-proofs.ts`
- `src/app/api/dpm/proofs/verify/route.ts`
- `src/app/api/storage/files/[id]/route.ts`
- `src/app/api/storage/batch-delete/route.ts`
- `src/app/api/storage/files/route.ts`
- `src/app/api/storage/stats/route.ts`
- `src/app/api/documents/route.ts`
- `src/app/api/documents/[id]/route.ts`
- La route de téléchargement protégée à l'itération précédente est réutilisée et testée.

### Tests et recette
- `src/lib/__tests__/helpers/dpm-db.ts`
- `src/lib/__tests__/dpm-backup-http.test.ts`
- `src/lib/__tests__/dpm-lifecycle.test.ts`
- `src/lib/__tests__/dpm-security.test.ts`
- `src/lib/__tests__/backup-data.test.ts`
- `scripts/dpm-rehearsal-audit.mjs`
- `docs/DELIVERY-PERFORMANCE-RECETTE-PHASE2.md`
- `docs/DELIVERY-PERFORMANCE-PHASE2.md`

## Pièces nécessaires pour lever le dernier verrou de recette

Voir la procédure détaillée **`docs/DELIVERY-PERFORMANCE-RECETTE-PHASE2.md`** : copie anonymisée cohérente avec identifiants historiques préservés, dump de schéma et journal réel, état des séquences/permissions, cas métier représentatifs, stockage Drive DE TEST et correspondance des fichiers autorisés, deux comptes et connexions PostgreSQL indépendantes. Ne transmettre aucun secret ni accès de production dans la conversation.

## Risques restant bloquants

1. Concordance schéma/journal réel non démontrée ; deux colonnes historiques absentes du replay de migrations.
2. Pas de preuve PostgreSQL multi-connexions pour les courses décision/révocation/restauration/réception/preuve.
3. Pas de contrôle réel Drive après restauration, ni de recette des droits externes Drive.
4. Services métier non exposés, et périmètre multisite de toute future API à recetter avant activation.
5. Délégation des capacités globales de maintenance/calendrier à faire approuver, sans grant implicite.
6. Propriétaire/superutilisateur PostgreSQL peut désactiver des triggers : compte applicatif non propriétaire et privilèges minimaux indispensables.

**Conclusion : PHASE 2 NON VALIDÉE. Ne pas déployer 0007, ne pas activer les fonctionnalités DPM et ne pas démarrer la phase 3 avant recette explicite.**
