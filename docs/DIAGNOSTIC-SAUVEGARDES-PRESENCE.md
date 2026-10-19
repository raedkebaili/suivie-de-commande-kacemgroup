# Diagnostic : sauvegardes quotidiennes et présence admin

## Diagnostic établi à partir du code

L'ancien mécanisme n'était pas adapté au déploiement Vercel :

1. `instrumentation.ts` démarrait un `setInterval`, puis appelait le serveur sur `127.0.0.1`. Une fonction serverless n'est pas un processus permanent : aucun intervalle ne garantit une exécution quotidienne sans requêtes.
2. La tâche serveur exigeait l'égalité exacte de la minute avec `backup_time`. Un démarrage tardif manquait l'échéance. Le navigateur ne couvrait qu'une fenêtre de cinq minutes et uniquement lorsqu'un Super Admin gardait la page ouverte.
3. La date `backup_last_run` était mise à jour aussi en échec ; les planificateurs pouvaient considérer la journée comme déjà traitée et ne pas retenter.
4. Les heures dépendaient du fuseau serveur/navigateur tandis que les dates étaient comparées en UTC.
5. Plusieurs instances/onglets pouvaient déclencher simultanément une sauvegarde ; la minuterie du navigateur envoyait `force: true`.
6. La rétention supprimait les anciens fichiers **avant** de réussir la nouvelle collecte.
7. Les associations de documents Drive et les marquages de modifications d'archive n'étaient pas dans le collecteur partagé. Ils sont désormais exportés/restaurés ; les fichiers physiques Drive restent externes.

Ces constats viennent de l'inspection du dépôt. Aucune base de production, configuration privée Vercel ni exécution historique réelle n'a été inspectée ou modifiée.

## Correctifs

- Service partagé `runAutomaticBackup`, appelé directement sur serveur persistant et via une route Cron sur Vercel.
- Échéance calculée explicitement en `Africa/Tunis` (variable serveur `BACKUP_TIMEZONE`), indépendante du fuseau du navigateur et du serveur.
- Rattrapage de la dernière échéance si l'heure a été manquée ; aucun faux fichier n'est créé pour chacun des jours passés : une sauvegarde de l'état actuel est générée.
- Contrôle de la dernière **réussite** dans l'historique, pas seulement de la dernière tentative. Après un échec, une nouvelle tentative est autorisée au prochain déclenchement après dix minutes ; ce délai n'est pas en lui-même un déclencheur.
- Verrou transactionnel PostgreSQL partagé entre les instances. Snapshot repeatable-read, checkpoint commun et reprise bornée des conflits de sérialisation PostgreSQL.
- Création, statuts et purge des anciens succès dans la même transaction. Un échec de la collecte ou de l'insertion ne détruit pas les précédentes sauvegardes. Les sauvegardes manuelles ne sont pas purgées par cette règle.
- Les sauvegardes manuelles et restaurations utilisent le même verrou pour ne pas se chevaucher avec la collecte automatique.
- Historique d'échec conservé et diagnostic visible : dernière réussite, dernière vérification, dernier appel Cron, origine du déclenchement et échéance en attente.
- Le navigateur ne force plus la sauvegarde et ne bloque plus la planification sur un sélecteur de dossier lancé sans clic utilisateur. Le choix du dossier est un bouton explicite. Les copies locales des sauvegardes créées par Cron sont également récupérées si ce navigateur reste ouvert et dispose de la permission.

## Configuration indispensable sur Vercel

1. Dans les variables d'environnement du projet **Production**, définir un `CRON_SECRET` aléatoire et suffisamment long, distinct de `JWT_SECRET`. Le créer hors du dépôt ; ne pas le coller dans une conversation ou dans Git.
2. Conserver `BACKUP_TIMEZONE=Africa/Tunis` (ou configurer un autre fuseau IANA approprié).
3. Redéployer en production : `vercel.json` déclare `GET /api/backup/cron` à `0 21 * * *` UTC, soit **22:00 à Tunis**. L'heure par défaut de l'application est 22:00.
4. Vérifier le Cron dans le tableau de bord Vercel et la date **Dernier appel Cron** dans Sauvegarde. L'écran indique la présence de la variable de secret, pas une garantie de bon fonctionnement du fournisseur.
5. Le Cron Vercel ne s'exécute pas automatiquement sur les déploiements Preview. Le bouton de test admin reste utilisable dans un Preview disposant d'une base de test.
6. Pour une autre heure configurée, des tentatives rapprochées ou un fuseau avec changement saisonnier, adapter le déclencheur. Un Cron externe appelant la route toutes les cinq minutes avec `Authorization: Bearer <CRON_SECRET>` est recommandé (ou adapter la fréquence Vercel si le forfait le permet). Le service ne crée une sauvegarde que lorsqu'une échéance est due. Un appel par jour ne peut retenter qu'au prochain appel après un échec, sauf navigateur admin ou autre déclencheur actif.
7. Les anciens outils peuvent encore appeler `POST /api/backup/auto` avec `x-backup-secret: <BACKUP_SECRET>` ; le repli sur `JWT_SECRET` est supprimé. `force` n'est autorisé qu'à un Super Admin connecté.

## Serveur persistant / réseau local

Une vérification directe du service est faite chaque minute, avec rattrapage après redémarrage. Aucune URL interne ni secret HTTP n'est nécessaire. Le processus doit évidemment être en fonctionnement et la base accessible. La copie dans un dossier du poste utilisateur nécessite un navigateur compatible ouvert et une permission ; elle est distincte de la sauvegarde conservée dans l'historique en base.

## Limites de stockage

Le JSON principal reste dans `backup_history` dans **la même base**. Cela ne protège pas d'une perte totale de cette base. Conserver une copie externe et activer les sauvegardes/PITR du fournisseur PostgreSQL. Les données de présence et l'historique de sauvegardes sont volontairement exclus des fichiers (pas de sessions ressuscitées ni récursion). Les mots de passe ne sont pas exportés. Les sauvegardes contiennent des données métier sensibles ; les copies externes doivent être protégées.

## Présence des utilisateurs

- Tous les utilisateurs connectés (mobile et ordinateur) envoient un heartbeat toutes les 60 secondes lorsque leur page est visible.
- L'indicateur n'est monté que pour les Super Admins ; l'API de lecture refuse les autres rôles. Rafraîchissement toutes les 30 secondes.
- **En ligne** = utilisateurs distincts dont un onglet a envoyé un heartbeat dans les trois dernières minutes et dont le compte est encore activé. Ce n'est pas un suivi en temps réel à la seconde ni une preuve d'activité clavier.
- **Actifs** = comptes `users.active = true`, pas le nombre de sessions. Plusieurs onglets/appareils ne multiplient pas le compteur utilisateur.
- La déconnexion efface le signal de l'onglet concerné ; les autres onglets restent indépendants. Une fermeture brutale, un réseau coupé ou un onglet masqué expirent après trois minutes.
- Le signal est stocké en PostgreSQL (`user_presence`), pas en mémoire d'une instance serverless. Les anciennes entrées sont nettoyées ; aucune liste nominative n'est exposée.
- La table est créée de façon idempotente au premier usage. Pour un compte applicatif sans droit DDL, faire appliquer `drizzle/0006_user_presence.sql` par le responsable de la base avant déploiement. Le schéma et le journal Drizzle sont aussi mis à jour. Si la table est indisponible, l'indicateur affiche une erreur, jamais un faux zéro.

## Validation

Tests automatiques : rattrapage, fuseaux et minuit, priorité de la dernière réussite, délai de nouvelle tentative, rétention bornée, verrou occupé, purge après insertion, aucune purge en erreur, conflit de sérialisation, secret Cron et autorisations de présence, exclusion des mots de passe et des données éphémères.

Recette avec base de test : connecter deux comptes et plusieurs onglets ; vérifier le compteur, le logout et l'expiration. Forcer une sauvegarde admin, télécharger le JSON, vérifier les tables, puis restaurer sur une base isolée. Simuler un échec et un redémarrage après l'échéance. En production, vérifier le lendemain le véritable appel Cron et le fichier créé sans navigateur ouvert. Ces essais réels ne sont pas remplacés par les tests unitaires à API/DB simulées.
