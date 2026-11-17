# DPM — découverte de synchronisation SQL automatique dans Vercel

## Faits confirmés après connexion Vercel

- Projet existant `suivie-de-commande-kacemgroup`.
- Déploiement Preview du commit `a6160b5cdf37d2ba788cf5789957093c95104736` : `dpl_DsL5BnsedSv2e3mFM2tNB2eRoHcC`, état READY.
- Le réglage de build Vercel était `npx drizzle-kit push && npm run build`, malgré les consignes de migration SQL explicite.
- Les journaux de CE déploiement montrent l'exécution de cette commande, la lecture du schéma puis `[✓] Changes applied` avant Next.js.
- Le build a donc annoncé des modifications sur sa base configurée. Le détail SQL, l'état avant/après, l'intégrité des lignes et les protections SQL réellement présentes ne sont PAS démontrés par ces logs.
- La même définition de variable DATABASE_URL cible production et preview dans la configuration. Le statut Preview ne permet donc pas de supposer une base isolée. Aucune valeur de secret n'a été déchiffrée ou recopiée.

**Correction des rapports précédents :** aucune migration n'avait été lancée manuellement dans le sandbox, mais la configuration Vercel a effectué une synchronisation automatique au push. Les anciennes phrases « aucune donnée/base modifiée » ne peuvent plus être utilisées comme garantie après ce déploiement.

## Mesures de confinement effectuées

1. Réglage de build du projet Vercel remplacé par `npm run build` via le connecteur, réponse confirmant cette valeur.
2. Même commande fixée dans `vercel.json` pour les futurs déploiements du dépôt. Le script npm build reste uniquement `next build`.
3. Aucun lancement de migration, reset, rollback SQL, suppression, promotion ou activation de DPM effectué après la découverte.
4. Ajout d'un contrôle de disponibilité opérationnelle DPM, en lecture seule : présence des 16 tables et des 34 triggers critiques actifs, rattachés à leurs tables/fonctions attendues dans public. Un simple nom de table d'audit ne suffit plus.
5. Configuration, grants, rapport de performance et diagnostic Drive refusent de fonctionner si ces protections sont absentes, même si un flag d'activation est défini.
6. Diagnostic `GET /api/dpm/readiness`, réservé au superadmin authentifié, sans cache et sans secrets. Accessible sans activer DPM ; retourne les protections manquantes, ne fait aucune réparation.

Ce contrôle est un garde-fou minimum, pas une certification exhaustive de migration : il ne compare pas le corps complet des fonctions, toutes les contraintes/index/colonnes, les privilèges, les sauvegardes ou les lignes historiques. Il ne prouve pas que les protections sont absentes de la base réelle : cela doit être mesuré, pas déduit des seuls logs.

## Tests exécutés avant le commit de confinement

- TypeScript : réussi.
- ESLint : réussi.
- **529 tests réussis sur 74 fichiers**, dont les 18 scénarios KPI.
- Build Next.js : réussi.
- Régressions ajoutées : build uniquement compilatoire ; schéma contenant seulement la table d'audit refusé ; migration explicite complète reconnue en PGlite ; trigger désactivé détecté ; rapport bloqué en 503 ; diagnostic réservé au superadmin.

Les tests utilisent uniquement des bases éphémères ; aucune vérification d'intégrité de la base réelle n'est revendiquée.

## Étape suivante nécessaire avant toute régularisation

- Conserver l'état actuel et une sauvegarde PostgreSQL complète vérifiée. Rechercher également une sauvegarde ou un point de restauration ANTÉRIEUR au déploiement a6160b5.
- Auditer en lecture seule : tables DPM présentes, triggers/fonctions/contraintes/index, journal de migration, séquences, nombres de lignes et rapprochement avec la sauvegarde antérieure. Le diagnostic d'application ne remplace pas cette inspection complète.
- Ne PAS rejouer 0007 aveuglément : des tables peuvent déjà exister sans les fonctions/triggers SQL. La réparation éventuelle doit être une migration additive versionnée, fondée sur l'état réellement observé, testée sur copie et explicitement autorisée.
- Ne pas promouvoir cette Preview ni activer DPM tant que ce contrôle n'est pas terminé.
- Les fichiers de base de données et secrets ne doivent pas être transmis dans le chat ; utiliser les procédures de stockage/accès sécurisées de l'environnement.

Le connecteur Vercel permet la gestion du projet et des déploiements, mais ne fournit pas d'outil de requête PostgreSQL ou de sauvegarde/restauration de la base. Sa connexion ne constitue donc pas, à elle seule, une preuve d'accès SQL ni de sauvegarde vérifiée.
