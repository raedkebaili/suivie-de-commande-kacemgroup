# DPM — procédure de recette sur copie représentative

**Aucune étape de cette procédure n'a été exécutée sur une base réelle pendant cette intervention. Ne pas viser la production. Ne pas utiliser drizzle-kit push.**

## Éléments nécessaires

1. Copie anonymisée récente et isolée de la base PostgreSQL, avec version PostgreSQL et extensions, ainsi qu'un dump de schéma incluant contraintes, index, triggers, fonctions, séquences et journal des migrations réellement appliquées. Ne pas transmettre une URL de production ni des secrets dans la conversation.
2. Anonymisation cohérente : mêmes identifiants et relations, pseudonymes pour les personnes/clients, conservation des rôles, états, dates, quantités, corrections signées et historiques. Supprimer mots de passe réels, cookies, jetons OAuth, clés Drive et secrets de configuration de cette copie. Préserver les propriétés métier nécessaires à la recette, pas les données personnelles.
3. Jeux représentatifs : les quatre usines existantes et leurs identifiants, commandes multiligne/multisite, réceptions partielles/corrigées, annulations, corrections de lots, documents, études, archives, recouvrement, plannings et anciennes sauvegardes. Documenter ce qui n'existe pas dans la base avant DPM ; ne pas prétendre y avoir trouvé des faits DPM.
4. Stockage Drive DE TEST autorisé, avec fichiers de preuve copiés si leur reproduction est autorisée et correspondance explicite des identifiants de fichiers dans la copie. Des fichiers de production accessibles depuis une copie de base ne constituent pas un environnement isolé.
5. Deux comptes applicatifs distincts et deux connexions PostgreSQL indépendantes sur cette copie, compte applicatif non propriétaire/non superutilisateur, capacités minimales explicites et inventaire des privilèges.
6. Validation des écarts historiques avant migration DPM. Les tests locaux ont découvert `order_items.reference` et `photometric_study_items.order_item_id` absents après 0000–0006, alors que le schéma applicatif les attend. Le défaut de `notifications.type` diffère également entre modèle et baseline (la fixture fournit explicitement cette valeur). Vérifier l'état réel ; ne pas intégrer une réparation implicite dans 0007.

## A. Contrôles préalables, lecture seule

- Confirmer manuellement l'identité de l'hôte/base de recette et l'absence de connexion au stockage de production.
- Conserver un dump de récupération indépendant, plus une sauvegarde via l'API existante de la copie.
- Utiliser une variable distincte de `DATABASE_URL` :

```sh
# Valeur fournie localement et de manière sécurisée, jamais copiée dans le chat.
export DPM_REHEARSAL_ACK=ISOLATED_ANONYMIZED_COPY
export DPM_REHEARSAL_DATABASE_URL='…connexion de recette uniquement…'
node scripts/dpm-rehearsal-audit.mjs snapshot backups/dpm-before.json
```

Le script ouvre une transaction READ ONLY / REPEATABLE READ. Il collecte uniquement empreintes/nombres de lignes et inventaire du schéma, contraintes, triggers, fonctions et séquences ; pas de lignes métier ou d'URL de connexion dans le fichier produit. Les sorties `backups/` sont ignorées par Git. Le calcul d'empreinte agrège des hachages : prévoir mémoire/temps appropriés pour une grosse copie.

## B. Rejouer et comparer les migrations

1. Sur une seconde base de recette vide, rejouer 0000–0006 dans l'ordre avec arrêt à la première erreur. Comparer le schéma obtenu au schéma de la copie réelle, notamment les deux colonnes manquantes identifiées. **Aucun alignement automatique silencieux.**
2. Sur la copie représentative dont les prérequis ont été validés, appliquer UNIQUEMENT le projet 0007, sous transaction unique, avec un outil PostgreSQL approuvé et `ON_ERROR_STOP`. Ne pas réappliquer les baselines sur une base déjà peuplée.
3. Ne pas inscrire artificiellement des entrées dans un journal de migration inconnu. La procédure d'enregistrement définitive de 0007 doit être approuvée après concordance de l'état réel et du journal.
4. Créer le second instantané et comparer :

```sh
node scripts/dpm-rehearsal-audit.mjs snapshot backups/dpm-after.json
node scripts/dpm-rehearsal-audit.mjs compare backups/dpm-before.json backups/dpm-after.json
```

La comparaison signale les changements de données métier, séquences préexistantes, contraintes perdues/modifiées, contraintes/triggers critiques manquants, colonnes historiques attendues manquantes et tables DPM non vides immédiatement après migration. Elle ne vaut pas approbation de déploiement. Examiner aussi l'inventaire COMPLET des fonctions, triggers et contraintes, les droits du compte applicatif et les journaux réels ; la liste automatique de protections critiques n'est pas exhaustive.

Attendu : mêmes lignes/identifiants/quantités/journaux historiques, mêmes séquences préexistantes, aucune habilitation ou correspondance DPM créée automatiquement, aucun indicateur activé. Seuls les nouveaux objets DPM et le trigger justifié de protection de `drive_documents` doivent apparaître.

## C. Sauvegarde/restauration HTTP

- Sur les seules copies : GET sauvegarde authentifié, puis POST restauration vers une AUTRE destination DPM vide dont le schéma a été approuvé.
- Comparer les 52 collections actuellement exportées (36 métier et 16 DPM) ; `backup_history` et présence éphémère sont volontairement exclus du contrat de sauvegarde.
- Vérifier quantités produites/livrées/nettes/acceptées, commandes/articles/lots, références documentaires, anciennes décisions/révisions et journal. La réinitialisation obligatoire des mots de passe absents de l'export est un comportement de sécurité existant.
- Vérifier séquences supérieures aux maxima ; une séquence ne doit jamais être abaissée par la restauration. PostgreSQL ne rollback pas les consommations de séquence : des trous sont attendus et sans perte de ligne.
- Injecter une mauvaise FK en fin d'import, puis une erreur au milieu des insertions ; comparer toutes les lignes au snapshot antérieur. Ensuite, tester une vraie perte de connexion/arrêt de processus sur copie isolée. Une exception simulée en test local ne remplace pas cet essai.
- Une destination DPM peuplée doit retourner 409 sans suppression. Ne pas vider le journal ni désactiver des contraintes pour contourner ce refus. Ce système ne fusionne pas deux historiques.

## D. Concurrence et habilitations

- Tester simultanément deux décisions opposées sur la même soumission depuis deux sessions/connexions : une seule décision terminale et un seul audit correspondant ; aucune réécriture de soumission.
- Tester révocation vs revue, restauration vs décision, correction de lot vs réception, publication vs ajout d'exception, association de preuve vs suppression Drive. Surveiller deadlocks/timeouts ; ne pas les masquer.
- Pour chaque site KER-01/KER-02/AGU-01/AGU-02, vérifier READ, DECLARE, TECHNICAL_REVIEW, IMPACT_ANALYSIS, LOGISTICS_REVIEW et INDUSTRIAL_APPROVAL séparément. Un superadmin sans grant n'approuve pas implicitement.
- Vérifier utilisateur désactivé et grant révoqué, y compris après une lecture antérieure. L'UI de grants n'attribue que des droits par site rapproché. La publication d'un calendrier partagé nécessite actuellement CONFIGURE global explicite, non attribuable par cet écran : sa procédure d'amorçage et sa politique de délégation restent à approuver.
- Les fonctions de soumission/revue/décision/correction sont des services serveur de phase 2, non des écrans/API métier activés. Leur exposition future devra transmettre uniquement l'acteur authentifié, jamais un acteur fourni par le navigateur.

## E. Preuves Drive

- Dans l'environnement de recette approuvé uniquement : utiliser le diagnostic `POST /api/dpm/proofs/verify` (fermé par défaut, superadmin ET READ global explicite requis). Chaque preuve doit être présente et non mise à la corbeille ; `missing_or_inaccessible` bloque la recette.
- Tester listes, recherche, documents contextuels, statistiques et téléchargement pour chaque site. Une preuve partagée exige READ sur tous les sites associés ; un rattachement de site inconnu exige un READ global explicite. Les sauvegardes de récupération demeurent réservées au superadmin et contiennent les références nécessaires à une restauration globale ; elles ne sont pas des exports métier par site.
- Simuler puis essayer sur fichiers de TEST la suppression/renommage/déplacement direct d'une preuve et de ses dossiers parents : refus. Un fichier sans lien doit rester modifiable. Tester les lots mêlant preuves et fichiers ordinaires, les erreurs réseau, les fichiers supprimés hors application et la corbeille.
- Le parcours des parents échoue fermé si une arborescence de preuve n'est pas vérifiable ; cela peut encore empêcher une opération sans lien dans ce cas d'erreur, mais pas lorsque l'arborescence est vérifiable et sans lien.
- Vérifier les accès directs Google Drive et les partages externes : les protections de l'application ne retirent pas les droits accordés en dehors de l'application.

## Critère de sortie

Produire les deux snapshots, rapport de comparaison et d'écarts, journaux de migration, résultats de restauration HTTP, tests PostgreSQL multi-connexions, diagnostic des fichiers réels et procès-verbal d'habilitations. **Tout écart non expliqué, toute preuve absente ou tout test de sécurité en échec maintient la phase 2 NON VALIDÉE. Ne pas démarrer la phase 3.**
