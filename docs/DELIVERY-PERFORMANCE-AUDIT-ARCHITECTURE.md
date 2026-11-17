# DELIVERY PERFORMANCE MANAGEMENT — audit et architecture d’intégration

**Statut : phase 1 uniquement.** Ce document distingue l’existant vérifié du modèle proposé. Aucun changement applicatif, aucune migration ni connexion à la base de production n’ont été effectués pour cet audit. Les données réelles de configuration et l’état des migrations effectivement appliquées en production restent à contrôler avant déploiement.

## 1. Architecture constatée

- Next.js 16 App Router, React 19, TypeScript, composants sous `src/components`, navigation par onglets dans `src/app/page.tsx`, interface mobile dédiée.
- Route handlers REST sous `src/app/api`, PostgreSQL via `pg` et Drizzle. Schéma central : `src/db/schema.ts`, connexion paresseuse : `src/db/index.ts`.
- JWT/cookie HttpOnly et revalidation du compte en base dans `src/lib/auth.ts` ; contrôles de rôles dans les API. Les restrictions de navigation seules ne sont pas une protection.
- Huit rôles existants : superadmin, commercial, technique, planification, consultant_prod, recouvrement, acces_agence, gerant. Le gérant reste en consultation ; son périmètre de navigation ne doit pas être élargi implicitement.
- Recharts est déjà utilisé dans `DashboardView.tsx` et `DelayStatistics.tsx`. `xlsx` est déjà utilisé pour les exports. Pas de moteur de génération PDF identifié dans les dépendances actuelles ; stocker/visualiser un PDF n’équivaut pas à le générer.
- Vitest, Testing Library et PGlite sont présents. Les tests SQL peuvent rester isolés de la base applicative.

### Réutilisation des données

| Besoin | Existant vérifié | Limite à traiter |
|---|---|---|
| Commande et client | `orders.id`, `orderNumber`, `orderDate`, `createdAt`, `clientId`, `agencyId`, états et annulation | Aucune échéance contractuelle initialement confirmée ni chaîne d’approbation de ses révisions |
| Quantités par article | `order_items.quantity`, `producedQty`, `deliveredQty`, `deliveryDate` | Quantité livrée ne signifie pas quantité reçue et acceptée ; la date portée par l’article n’est pas tout l’historique |
| Livraisons partielles | `expedition_batches` : quantité signée, cumul, date, chauffeur, chargement prévu, note | Pas d’en-tête de livraison/BL, sites de fabrication et d’expédition structurés, quantités acceptées ou preuve de réception |
| Production | `production_batches`, `production_plan_entries`, usine, quantités appliquées, dates | Une date de planning n’est pas une échéance contractuelle client |
| Sites | `factories.id`, `code`, `name`, responsable, actif ; API et vue Usines | Pas de région structurée, calendrier de site ni autorisations utilisateur/site. Le code ne prouve pas quelles lignes existent en production |
| Affectation usine | `production_plan_entries.factoryId`, copie historique du nom, `order_items.productionUnit` texte | L’unité actuelle ne suffit pas à reconstituer l’allocation historique d’une livraison multi-sites |
| Familles LED | `article_family_catalog`, `article_family_assignments`, `article-recognition.ts` | Réutiliser le catalogue ; distinguer la classification actuelle d’un éventuel instantané historique |
| Dates de fin | `completion-dates.ts` : franchissement de seuil du journal signé, correction/retour arrière pris en compte | Date d’enregistrement serveur, pas preuve de réception physique/acceptation client |
| Calculateur actuel | `delay-statistics.ts`, `/api/dashboard/delays` | Durées calendaires depuis la commande et seuils de simulation ; populations différentes des nouveaux KPI contractuels |
| Audit | `activity_logs`, `modification_logs`, helpers de journalisation | Les journaux généraux ne constituent pas un workflow structuré, versionné et immuable des décisions industrielles |
| Documents | Stockage Drive, `drive_documents`, `DocumentsPanel`, contrôles agence | Associations actuelles commande/étude seulement ; retrait d’association et suppression de fichier possibles selon les droits existants |
| Sauvegarde | `backup-data.ts`, sauvegardes manuelles/automatiques, restauration transactionnelle | Intégrer tous les nouveaux objets et prévoir la compatibilité avec les anciennes sauvegardes et l’audit append-only |

### Points de vigilance identifiés

1. `agency-scope.ts` restreint le rôle `acces_agence` par agence. Une agence commerciale n’est pas un site de fabrication. Ce contrôle ne peut pas être réutilisé comme autorisation par usine.
2. Certaines API de planning/opérations autorisent des rôles globaux. Garantir le cloisonnement par site nécessite une politique serveur explicite, pas uniquement un filtre de dashboard.
3. `getOrderVisualState` accepte encore un état manuel `LIVREE` et des totaux agrégés pour l’affichage historique. Le nouveau moteur ne devra pas utiliser cette couleur ou ce badge comme preuve de satisfaction complète.
4. Les corrections d’expédition et de production créent des mouvements négatifs : les ignorer surévaluerait les livraisons et la performance.
5. Le README recommande actuellement `drizzle-kit push`. Pour ce module, ce n’est pas une procédure de migration de production suffisante : il faudra des scripts SQL versionnés, contrôlés et testés.
6. Les quatre codes demandés ne sont pas prédéfinis dans le code examiné. Aucune usine existante ne doit être renommée, fusionnée ou créée avec un responsable inventé.

## 2. Décisions d’architecture

### Ne pas remplacer l’application

Créer un espace métier « DELIVERY PERFORMANCE MANAGEMENT » et sa synthèse « DELIVERY PERFORMANCE » dans le dashboard existant. Conserver les opérations et le calculateur actuel, clairement identifié comme analyse de durées et non comme OTD/OTIF contractuel. Pas de second registre de commandes, clients, utilisateurs, familles ou mouvements de stock.

Nouveau code métier regroupé sous `src/lib/delivery-performance/`, API sous `src/app/api/delivery-performance/`, composants sous `src/components/delivery-performance/`. Noms proposés, pas encore créés.

### Modèle additif proposé

Les objets suivants répondent à des informations absentes ; leur découpage SQL final sera arrêté en phase 2.

1. **Sites et droits** : réutiliser `factories` et ses codes éditables. Ajouter le rattachement géographique Kerkennah/Agareb, le calendrier applicable et des habilitations explicites utilisateur/site/capacité. Ne pas déduire un droit de validation du seul fait d’être responsable déclaré dans une fiche usine.
2. **Calendriers versionnés** : calendriers, plages hebdomadaires travaillées et exceptions datées (jours fériés, fermetures, ouvertures exceptionnelles). Un site peut surcharger le calendrier commun. Version et période d’effet conservées pour reproduire les rapports.
3. **Engagements de livraison versionnés** : rattachement à la commande et, si nécessaire, à une tranche/article ; date de commande initiale figée lors de la qualification, échéance initialement confirmée immuable, échéance révisée proposée puis validée, quantité convenue, preuve, motif, auteur, validateur et dates. Réviser un engagement ajoute une version ; n’écrase jamais la première.
4. **Livraisons / lignes / réception** : en-tête numéroté, BL, sites de fabrication/expédition, lignes liées aux articles, quantité prévue et engagement associé. Lier les mouvements existants aux lignes sans réécrire les anciens lots. Réceptions et corrections historisées portent quantités reçues, acceptées, refusées et dates réelles. Le cumul expédié existant reste distinct de la quantité acceptée utilisée pour la satisfaction client.
5. **Événements et impacts** : registre des événements, sites, catégories internes/externes, dates/heures, causes, déclarant ; liaisons aux commandes/tranches, chemin critique, intervalles réellement impactés, durée demandée et durée admissible. Un événement partagé entre plusieurs commandes ne doit pas être dupliqué.
6. **Décisions et preuves** : étapes de vérification et décisions append-only, liées à une version précise de l’événement et de son analyse d’impact. Réutiliser le stockage physique existant ; ajouter des associations documentaires dédiées et protéger les preuves retenues contre un retrait/suppression ordinaire. Une simple URL n’est pas une preuve vérifiée.
7. **Actions correctives** : cause racine 5M, responsable, échéance, statut, constat et preuve de vérification d’efficacité ; rattachement à une commande et/ou un événement. La cause 5M reste indépendante de l’exonération.
8. **Jalons / transferts** : engagements et réalisations des transferts intersites et étapes de processus, avec sites source/destination et quantités lorsque nécessaires. KPI-09/10 ne sont pas déductibles du seul planning actuel ; sans observations, résultat N/A.
9. **Audit métier append-only** : opérations, acteurs et habilitations utilisées, ancienne/nouvelle version, horodatage, motif et identifiant de requête. Protéger UPDATE/DELETE au niveau base pour le compte applicatif ordinaire ; corriger par nouvelle écriture. Conserver aussi les journaux généraux pour le Watchdog.

Contraintes envisagées : clés étrangères, unicité des références de livraison dans leur périmètre d’émission, clé d’idempotence des écritures, quantités non négatives pour les documents métier, dates cohérentes, quantité acceptée bornée par le livré net, versions initiales uniques, index sur échéance/site/commande/statut/date. Les mouvements de correction restent signés dans le journal existant.

### Gestion des comptes et des sites

Proposition : capacités additionnelles attribuées aux comptes existants, sans renommer leurs rôles : lecture, déclaration site, vérification technique, analyse production/planification, vérification logistique, décision industrielle, administration des paramètres. Refus par défaut en l’absence d’habilitation ; pas d’approbation finale automatique accordée au rôle `planification` ou `technique`.

Combiner habilitation site et restriction agence lorsqu’elle existe. Appliquer le même périmètre à la liste, aux compteurs, graphiques, détails, documents, notifications et exports. Une commande multi-sites ne doit pas donner accès aux informations des autres sites : le détail local est distinct de la lecture complète, laquelle nécessite une autorisation explicite. Les KPI de commande complète ne doivent pas être recalculés frauduleusement à partir d’une portion visible seulement.

## 3. Calculs prévus

### Calendrier

- Fuseau métier proposé : `Africa/Tunis`, avec horodatages d’événements stockés avec fuseau. Ne pas convertir silencieusement les anciens timestamps sans fuseau.
- Pour des échéances exprimées en dates : compter les dates travaillées dans **]échéance, date de fin ou de situation]**. Le jour de départ n’est pas compté comme une journée entière.
- Les jours travaillés sont fournis par le calendrier applicable et ses exceptions ; pas de simple division des millisecondes par 86 400 000 pour les KPI ouvrés.
- Pour les événements horaires : intersecter les impacts avec les plages de travail réelles ; la conversion en jours équivalents s’appuie sur les durées de travail du calendrier, pas sur une durée universelle arbitraire de huit heures.
- Jours fériés tunisiens : données administrables par année, provenance et validation. Les fêtes à date mobile ne doivent pas être inventées automatiquement ni présentées comme officiellement confirmées sans source validée.
- Pour une commande multi-sites, figer le calendrier contractuel de référence dans l’engagement ; ne pas choisir au hasard le calendrier du dernier site consulté. Les jalons propres aux sites conservent leur calendrier.

### Livraisons et satisfaction complète

À la date de situation, sommer les quantités **acceptées nettes**, article par article, en tenant compte des corrections et de l’engagement applicable. La commande n’est complète que si chaque article atteint sa quantité convenue. Ni une livraison partielle, ni un surplus sur un autre article, ni un statut manuel ne suffisent.

Conserver deux horloges : date réelle de livraison/réception et date d’enregistrement/validation. Les performances physiques reposent sur les dates réelles prouvées, pas sur l’heure de saisie. Les anciennes dates d’enregistrement restent consultables mais ne deviennent pas une preuve de réception par migration.

Calculer les performances de chaque tranche séparément, les quantités acceptées à échéance, puis la satisfaction complète. Pour les familles hétérogènes, ne pas fabriquer un taux pondéré par des unités non comparables ; documenter le périmètre de quantité et conserver le contrôle par article.

### Brut et maîtrisable

- Brut : `max(0, joursOuvrés(échéance applicable, fin réelle))` ; pour une commande ouverte, remplacer la fin par la date de situation sans la marquer livrée.
- Exonération : événement enregistré, preuve accessible vérifiée, lien causal et impact démontrés, durée réelle validée et admissibilité approuvée industriellement. Une catégorie « externe » ne suffit pas ; une panne interne n’est pas automatiquement exonérée.
- Fusionner les intervalles d’impact simultanés du même chemin critique avant tout décompte. Des branches parallèles ne sont pas additionnées comme si elles étaient séquentielles ; l’impact net validé sur l’échéance doit être démontré.
- Une perturbation antérieure à l’échéance peut avoir un effet causal : ne pas l’éliminer simplement parce qu’elle est hors de la fenêtre de retard. L’analyse doit identifier l’impact résiduel réellement admissible sur l’engagement.
- Net : `max(0, brut − impact admissible sans double comptage)`, plafonnement explicite. Distinguer durée physique de l’événement et impact admissible sur une commande.
- Une justification de retard ne rend pas rétroactivement une livraison ponctuelle pour l’OTD/OTIF brut. Les analyses maîtrisables sont séparées.

### Populations KPI

Définir un ensemble de commandes distinctes éligibles à la date de situation, avec échéance confirmée et données de réception qualifiées. Les annulations sont historisées et exclues selon leur date d’effet, pas simplement selon un état actuel susceptible de réécrire le passé. Prévisions, commandes sans échéance, anciennes réceptions inconnues et données incohérentes sont affichées en catégories distinctes, jamais converties en succès.

La population échue vérifie `échéance <= date de situation`. Une commande livrée en avance mais pas encore échue n’entre pas encore dans cette cohorte.

| KPI | Définition à implémenter conformément à la mission |
|---|---|
| 01 | Commandes échues complètement livrées en retard / commandes échues éligibles |
| 02 | Commandes échues avec retard net positif / commandes échues éligibles |
| 03 OTD | Commandes complètes livrées à temps / commandes complètes arrivées à échéance |
| 04 OTIF | Commandes complètes acceptées à temps et dans les quantités convenues / commandes échues éligibles |
| 05 | Somme des retards bruts / nombre de commandes avec retard brut positif, population et inclusion des ouvertes indiquées |
| 06 | Somme des retards nets / nombre de commandes avec retard net positif |
| 07 | Commandes ouvertes dont l’échéance est dépassée ; séparation des jours non travaillés sans retard ouvré positif |
| 08 | Heures d’arrêt réelles par site ; union des périodes pour un même équipement/périmètre, pas somme aveugle d’événements dupliqués |
| 09 | Transferts échus respectant l’engagement / transferts échus qualifiés ; aucune observation = N/A |
| 10 | Jalons échus respectant l’engagement / jalons échus qualifiés, par étape ; aucune observation = N/A |

**Point sémantique à conserver visible :** avec les formules littérales demandées, KPI-01 exclut les commandes encore ouvertes de son numérateur, alors que KPI-02 peut les inclure. Le taux maîtrisable peut alors dépasser le taux brut affiché, malgré un retard net individuel toujours inférieur ou égal au brut. Ne pas changer ces formules silencieusement. Présenter séparément le brut des commandes ouvertes et les dénominateurs ; tout alignement différent des deux populations doit être validé métier avant implémentation.

Un dénominateur nul donne N/A. Les statistiques globales sont recalculées sur les commandes distinctes, jamais comme une moyenne des pourcentages des sites. Une commande multi-sites peut apparaître dans plusieurs analyses locales, mais une seule fois dans le total. Les volumes locaux ne sont pas additionnables sans déduplication.

## 4. Workflow des événements

1. Déclaration par un responsable habilité du site.
2. Vérification technique selon la catégorie (Maintenance/HSE/Achats/Qualité).
3. Identification des commandes et chemins critiques par production/planification.
4. Vérification logistique de l’impact sur les engagements.
5. Décision industrielle : en attente, validé, partiellement validé ou refusé ; commentaire et périodes admissibles obligatoires pour une validation partielle.

Une modification substantielle des preuves, périodes ou commandes après approbation crée une nouvelle version à réexaminer ; elle ne conserve pas automatiquement l’ancienne exonération. Vérifier l’état attendu dans la transaction pour empêcher une validation concurrente d’une version obsolète. Verrouillage et ordre commande → article → planning existants à respecter pour les opérations de quantités.

Délais configurables : déclaration 24 h, preuves 48 h, analyse 3 jours ouvrés, décision 5 jours ouvrés. Définir clairement l’origine de chaque horloge ; proposition : début observé pour déclaration, déclaration pour les preuves, dossier technique complet pour analyse, dossier logistique complet pour décision. Ces dates sont enregistrées, pas déduites d’un seul `updatedAt`.

## 5. Dashboard et reporting

- Étendre le dashboard existant avec la section DELIVERY PERFORMANCE ; navigation détaillée distincte pour éviter de saturer le tableau des commandes.
- Un objet de filtres serveur commun : période/cohorte d’échéance, semaine, mois, site, famille, client, type de retard, validation et date de situation. Les filtres de validation sélectionnent les événements/populations ; ils ne rendent jamais admissible un événement refusé.
- Une même réponse calculée sous instantané cohérent fournit cartes, graphiques, classements et tables avec dénominateurs ; prévention des réponses asynchrones obsolètes.
- Séries hebdomadaires, sites et régions, familles LED, causes, événements en nombre et durée, OTD/OTIF ; séries absentes = absence de données, pas données fictives ni quatre pourcentages à zéro pour des sites non qualifiés.
- Rapport par défaut lundi–dimanche : global/sites, retard, risque, partielles, décisions, causes et actions. Définir la fenêtre de risque dans les paramètres.
- Excel : réutiliser `xlsx` et la même couche de calcul/permissions. PDF : nécessite une solution de rendu/génération dédiée à évaluer en phase 7 ; ne pas annoncer un export PDF terminé sur la seule base du visualiseur existant.
- Pour les rapports figés : conserver la date de situation, les versions des calendriers/engagements/règles et les populations. Un rapport réémis après correction doit être identifié comme révision.

## 6. Phases et critères de passage

| Phase | Travaux | Critère avant phase suivante |
|---|---|---|
| 1 — audit | Présent document, inventaire et questions de configuration | Politique de sites/habilitations et principes de calendrier explicités |
| 2 — schéma | Migrations additives, contraintes/index, habilitations, sauvegarde/restauration compatible | Tests migration sur copie représentative, aucune perte, réexécution maîtrisée, ancienne application compatible |
| 3 — calculs | Calendrier versionné, jours ouvrés, délais et moteur d’intervalles | Tests week-ends/fériés/heures partielles/chevauchements ; pas d’exonération non validée |
| 4 — livraisons | Engagements initiaux/révisions, tranches, BL, réception/acceptation, lien aux lots existants | Tests partielles, concurrence, idempotence et retours arrière ; pas de double écriture des cumuls |
| 5 — événements | Registre, pièces, cinq étapes, décisions, audit et actions 5M | Tests accès site, transitions interdites, preuve absente, version obsolète, refus et validation partielle |
| 6 — KPI | Populations exactes, N/A, tous graphiques/filtres, mobile | Réconciliation de chaque carte avec les commandes sources ; total multi-sites dédupliqué |
| 7 — rapports | Rapport hebdomadaire, Excel, PDF si solution validée | Même population/permissions que dashboard et absence de fuite dans les exports |
| 8 — qualification | 18 cas obligatoires + non-régression, migration et restauration | Tests automatisés, recette métier et procédure de déploiement documentée |

Les tests seront ajoutés à chaque phase, pas repoussés à la dernière. La phase 8 consolide la recette et la non-régression complète.

## 7. Préservation et déploiement proposés

- Aucun reset, seed de commandes, suppression de table ou normalisation destructive de l’historique.
- Échéances initiales, acceptations, sites et calendriers inconnus restent non renseignés tant que non qualifiés. Ne pas déduire une date contractuelle du seul planning de chargement.
- Faire correspondre explicitement les usines existantes aux codes KER-01/KER-02/AGU-01/AGU-02 ; aucun rattachement implicite par recherche approximative de nom.
- Sauvegarde vérifiée avant migration ; SQL versionné après 0006 selon l’état réel du journal. Ne pas supposer que les scripts du dépôt sont déjà appliqués sur la base cible.
- Déploiement progressif derrière activation de module, mise en place des droits/calendriers, qualification d’un périmètre pilote, rapprochement des résultats puis activation élargie.
- Les tables de faits nouveaux doivent aussi empêcher les suppressions destructrices de commandes/usines/justificatifs utilisés. Adapter les routes concernées seulement lorsque nécessaire et documenter cette nécessité.
- Intégrer les objets dans les sauvegardes et la restauration avec une version de format ; une ancienne sauvegarde dépourvue du module ne doit pas effacer ses données par défaut. Traiter spécifiquement les droits de restauration de l’audit append-only.
- Les migrations, imports de qualification et actions de maintenance ne seront pas exécutés sur la production sans étape explicite de déploiement.

## 8. Contrôle initial exécuté

Sur le dépôt audité, après installation des dépendances :

- TypeScript : réussi.
- ESLint : réussi.
- Vitest : **480 tests réussis, 66 fichiers**.
- Build Next.js : réussi.

Tests et build exécutés sans variable `DATABASE_URL` dans leur environnement. Les tests SQL utilisent des bases PGlite éphémères, pas la base de production. Ces 480 tests constituent une référence de l’existant ; **ils ne valident pas le module avancé non encore implémenté**. Les 18 scénarios demandés seront explicitement ajoutés et rapprochés des phases correspondantes.

## 9. Points à confirmer avant la phase 2

1. Semaine de travail réelle de chaque site, horaires et éventuelles différences ; source et validateur des jours fériés/fermetures.
2. Attribution des capacités industrielles aux comptes existants et périmètre des utilisateurs par site ; les fonctions Maintenance/HSE/Achats/Qualité/Logistique/Direction ne sont pas des rôles actuels.
3. Correspondance des quatre codes avec les usines réellement présentes. Sans information, proposer un écran de rapprochement administrateur et laisser les données non rapprochées à qualifier.

L’origine, la preuve et la date d’effet des engagements/receptions historiques devront ensuite être qualifiées. Aucune donnée historique inconnue ne sera transformée en livraison acceptée, échéance confirmée ou événement justifié pour remplir le dashboard.
