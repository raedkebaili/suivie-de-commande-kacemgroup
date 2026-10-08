# Guide d’utilisation et d’exploitation — OrderTrack Pro
## Kacem Group — version française du 8 octobre 2026

Ce guide décrit le fonctionnement de la plateforme, les responsabilités de chaque rôle, les limites connues et les procédures d’exploitation. Il ne contient aucun secret ni mot de passe. Les libellés d’écran peuvent évoluer, mais les règles serveur décrites ici sont la référence de sécurité.

---

## 1. Vue d’ensemble

OrderTrack Pro suit le cycle complet :

**commande commerciale → spécifications techniques → étude photométrique → planning de production → production → expédition → recouvrement → archivage**, avec recherche, notifications, documents Google Drive et sauvegardes.

La plateforme distingue deux familles d’états :

- **État commercial :** `Sur Stock`, `Bon de Commande`, `Prévision`.
- **État de production :** `En instance`, `En production`, `Livrée`, `Annulée`.

Les données sont partagées entre les modules, mais les droits d’écriture sont séparés. Une commande visible n’est pas nécessairement modifiable.

### Principes à retenir

1. La sidebar masque les modules non autorisés, mais l’API vérifie également les droits côté serveur.
2. Un compte désactivé perd l’accès dès la prochaine requête, même si une session navigateur existait.
3. Toute modification sensible doit être faite dans le module qui en a la responsabilité.
4. Un compte ne doit jamais être partagé entre plusieurs personnes.
5. Les fichiers Excel et les sauvegardes peuvent contenir des données sensibles : les transférer uniquement par un canal approuvé.

---

## 2. Connexion, mot de passe et session

### 2.1 Première connexion

1. Ouvrir l’URL interne communiquée par l’administrateur.
2. Saisir l’identifiant attribué et le mot de passe initial transmis par un canal sécurisé.
3. Si l’écran de changement obligatoire apparaît, choisir immédiatement un mot de passe personnel conforme à la politique affichée.
4. Ne jamais conserver le mot de passe initial dans un fichier partagé, une capture d’écran ou un ticket.
5. Vérifier que le nom complet et le rôle affiché sont corrects.

Le compte initial est un **Super Admin** technique. Il ne doit pas devenir un compte quotidien partagé : créer ensuite un compte nominatif pour chaque administrateur.

### 2.2 Changement de mot de passe

Le changement est obligatoire pour :

- le compte initial ;
- un compte créé par un Super Admin ;
- un compte importé ;
- un compte dont le mot de passe a été réinitialisé par un administrateur.

Choisir une phrase ou un mot de passe long, unique et non réutilisé sur un autre service. En cas d’oubli, seul le Super Admin doit effectuer la procédure de réinitialisation ; le nouveau titulaire le remplace dès la connexion suivante.

### 2.3 Déconnexion et déconnexion automatique

- Utiliser **Déconnexion** dans la barre latérale à la fin de chaque poste de travail.
- La session est automatiquement déconnectée après la durée d’inactivité configurée par le Super Admin.
- Les mouvements, clics, frappes, défilements et interactions tactiles réinitialisent le délai dans le navigateur.
- La durée n’est pas modifiable par les utilisateurs ordinaires.
- Le jeton de session a une durée maximale nominale de 12 heures ; une désactivation de compte est recontrôlée côté serveur.

Après une déconnexion automatique, se reconnecter. Si le poste est partagé, verrouiller également la session Windows et fermer les aperçus de documents.

### 2.4 Apparence et persistance personnelle

- Le mode clair/sombre est disponible dans la barre latérale et est mémorisé dans le profil.
- Le tableau des commandes mémorise par utilisateur les filtres, la recherche, le tri, les colonnes et l’affichage de la ligne TOTAL. Ces préférences ne sont pas une configuration globale.
- L’onglet actif est mémorisé pour chaque utilisateur dans le navigateur et restauré après actualisation, si l’onglet est encore autorisé par son rôle.
- Le bouton **Plein écran** du tableau reste visible en thème clair et sombre ; la touche `Échap` permet de quitter le plein écran.

---

## 3. Rôles et responsabilités

Le nom affiché doit être exactement **Gérant**. Sa valeur technique est `gerant`. Le rôle supplémentaire **Accès agence** (`acces_agence`) existe pour les utilisateurs limités à une ou plusieurs agences.

### 3.1 Matrice fonctionnelle

| Fonction | Super Admin | Commercial | Technique | Planification | Consultant Prod | Recouvrement | Gérant | Accès agence |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Tableau de bord | Écriture config | Lecture | Lecture | Lecture | Lecture | Lecture | Non | Non |
| Commandes | Tout | Commercial | Lecture + technique | Lecture + création interne | Lecture | Lecture | Lecture | Lecture agence |
| Clients / agences | Tout | Créer/modifier | Lecture indirecte | Lecture indirecte | Lecture indirecte | Lecture clients | Non | Périmètre agence |
| Matières / catégories | Tout | Non | Gérer | Non | Non | Non | Non | Non |
| Études photométriques | Tout | Lecture | Créer/modifier | Lecture | Lecture | Lecture | Lecture | Lecture agence si liée |
| Production | Tout | Non | Non | Saisir les lots | Lecture planning | Non | Non |
| Planning production | Gérer | Non | Non | Gérer | Lecture | Non | Lecture | Non |
| Usines | Gérer | Non | Non | Gérer | Non | Non | Non | Non |
| Expédition | Tout | Lecture | Lecture | Saisir les livraisons | Lecture | Lecture | Lecture | Non |
| Planning expédition | Gérer | Non | Non | Gérer | Lecture | Non | Lecture | Non |
| Télégestion | Gérer | Lecture | Gérer | Lecture | Lecture | Lecture | Lecture seule | Non |
| Recouvrement | Gérer | Lecture alerte | Lecture alerte | Lecture | Lecture | Gérer | Non | Lecture périmètre |
| Archive | Tout | Lecture | Lecture | Lecture | Lecture | Lecture | Lecture | Non |
| Stockage / documents | Tout | Métier | Métier | Métier | Lecture | Lecture | Lecture seule | Non |
| Watchdog | Tout | Non | Non | Non | Non | Non | Lecture seule | Non |
| Utilisateurs | Gérer | Non | Non | Non | Non | Non | Non | Non |
| Sauvegarde / restauration | Gérer | Non | Non | Non | Non | Non | Non | Non |
| Couleurs | Gérer | Non | Non | Non | Non | Non | Non | Non |

**Lecture indirecte** signifie que le rôle peut recevoir les données nécessaires dans les vues autorisées, mais ne dispose pas d’un écran d’administration du référentiel.

### 3.2 Super Admin — responsabilité système

Le Super Admin :

- crée, désactive, réinitialise et supprime les comptes selon la procédure interne ;
- attribue les agences au rôle Accès agence ;
- configure le délai d’inactivité, les sauvegardes automatiques, les couleurs et Google Drive ;
- peut importer les utilisateurs, les commandes, l’archive et les référentiels autorisés ;
- contrôle les journaux Watchdog ;
- réalise et vérifie les sauvegardes ;
- ne restaure ou ne réinitialise jamais une base sans validation et copie préalable.

### 3.3 Commercial — responsabilité commande et client

Le Commercial :

- crée et met à jour les clients, agences et commandes commerciales ;
- choisit le client, l’agence, l’affaire, l’état commercial, les articles, les quantités et les besoins client ;
- peut importer des commandes et exporter les données accessibles ;
- associe les documents d’affaire autorisés ;
- suit les études, la production, l’expédition et les alertes sans modifier les étapes dont il n’est pas responsable.

Il ne doit pas renseigner une spécification technique à la place du service Technique ni marquer un lot produit/livré lui-même.

### 3.4 Technique — responsabilité technique

Le Technique :

- renseigne les composants et spécifications techniques par article ;
- administre les matières et leurs catégories ;
- gère la télégestion et les études photométriques ;
- peut créer, modifier et associer les documents techniques autorisés ;
- consulte les commandes et suit l’impact d’une étude sur la lentille de l’article.

Lorsqu’une lentille d’étude est appliquée, le serveur vérifie qu’elle appartient à la catégorie Lentille et conserve la traçabilité de la modification.

### 3.5 Planification — responsabilité industrielle et logistique

Le rôle Planification :

- peut créer une commande uniquement en état commercial **Sur Stock / Besoin interne** ;
- ne peut pas modifier librement l’état commercial d’une commande existante ;
- affecte les articles à une usine et à une journée de production ;
- clôture les lignes de planning pour appliquer la quantité produite ;
- saisit les livraisons et gère le planning d’expédition ;
- ne doit pas expédier une quantité supérieure à la quantité produite disponible.

### 3.6 Consultant Prod — consultation industrielle

Le Consultant Prod consulte les commandes, le planning de production, les documents et les informations de suivi. Il ne crée pas de lot, ne clôture pas une ligne de production et ne modifie pas le planning.

### 3.7 Recouvrement — responsabilité financière

Le rôle Recouvrement :

- consulte les clients et les commandes ;
- attribue ou retire l’état de recouvrement d’un client ;
- ajoute la note utile au suivi ;
- conserve la traçabilité des changements dans l’historique.

Les états finaux sont exactement :

1. **Retard important** ;
2. **Client Bloqué**.

Un état supprimé retire ses affectations courantes avant suppression de la ligne catalogue. Les journaux historiques restent consultables et l’ancien état n’est pas recréé automatiquement.

### 3.8 Gérant — consultation stricte

Le Gérant dispose d’une vue de pilotage, jamais d’une capacité de mutation :

- commandes, archive, planning, expédition, planning d’expédition, Watchdog, stockage et télégestion sont consultables selon les onglets affichés ;
- il peut consulter, prévisualiser et télécharger un document autorisé ;
- il ne peut ni créer, modifier, supprimer, déplacer ou téléverser un document/fichier ;
- il ne peut pas changer les états, modifier un planning, enregistrer une expédition ou créer une commande ;
- les endpoints serveur refusent les méthodes d’écriture même si une requête est fabriquée manuellement.

### 3.9 Accès agence — périmètre limité

Le rôle Accès agence est limité aux agences affectées par le Super Admin. Il ne voit pas les commandes d’une autre agence, y compris par recherche, URL directe, détail de commande, client ou affaire. Il est en lecture seule et aucune agence ne doit lui être affectée sans justification métier.

---

## 4. Tableau de bord, recherche, notifications et préférences

### Tableau de bord

Les indicateurs présentent les volumes accessibles au rôle : commandes, clients, agences, répartition des états commerciaux et de production, priorités, agences, évolution mensuelle et quantités commandées/produites/livrées/restantes.

Un indicateur absent n’est pas nécessairement une erreur : il peut signifier qu’aucune donnée n’est accessible au périmètre courant.

### Recherche globale

Depuis la barre supérieure, saisir au moins deux caractères. La recherche porte notamment sur :

- numéro de commande ;
- affaire ;
- nom ou code client ;
- nom d’article.

Cliquer sur un résultat ouvre la vue concernée. Pour un rôle Accès agence, la recherche reste limitée au périmètre attribué.

### Notifications

Les notifications sont personnelles. Elles signalent notamment une étude photométrique, une livraison, une annulation ou un changement métier. Utiliser la cloche pour consulter les non-lues et marquer une notification comme lue. Une notification ne remplace pas le contrôle de la commande source.

### Préférences du tableau

Dans Commandes :

- filtrer par état commercial, état production, agence, usine, priorité, télégestion ou étude photométrique ;
- rechercher par texte ;
- trier par date, ordre alphabétique ou numéro ;
- masquer/afficher les colonnes disponibles ;
- masquer uniquement un badge d’état de production ;
- afficher/masquer la ligne TOTAL ;
- utiliser le plein écran.

Les réglages sont enregistrés pour l’utilisateur connecté. Ils ne doivent jamais être utilisés pour masquer une information à un autre utilisateur.

---

## 5. Cycle de vie d’une commande

### 5.1 Création

1. Ouvrir **Commandes** puis **Nouvelle**.
2. Saisir la date, le client, l’agence et éventuellement l’affaire.
3. Choisir l’état commercial : `Sur Stock`, `Bon de Commande` ou `Prévision`.
4. Ajouter au moins un article, une quantité positive et les informations utiles.
5. Vérifier les articles avant d’enregistrer.
6. Ajouter les documents après la création si nécessaire.

Le numéro de commande est généré par le serveur. L’aperçu ne constitue pas une réservation définitive.

Pour Planification, le formulaire est verrouillé sur **Sur Stock / Besoin interne** ; l’agence interne correspondante est résolue par le serveur.

### 5.2 Modification et verrouillage

- Le Commercial modifie l’en-tête et les informations commerciales.
- Le Technique modifie les spécifications techniques par article.
- Le Planificateur renseigne les étapes de production/logistique prévues.
- Une commande temporairement verrouillée par un autre utilisateur peut renvoyer une erreur `423` ; attendre la fin de l’édition ou vérifier l’auteur indiqué.
- Les modifications commerciales sont enregistrées dans l’historique : champ, ancienne valeur, nouvelle valeur, auteur et date.

Ne pas supprimer un article ayant déjà des lots de production ou d’expédition. Si une information est fausse, corriger la valeur et laisser la traçabilité plutôt que contourner les contraintes.

### 5.3 Suivi de production

1. Ouvrir le planning de production et sélectionner la date et l’usine.
2. Ajouter les articles et les quantités prévues.
3. Le planning est une prévision : la quantité réelle n’est appliquée qu’au passage prévu à l’état terminé.
4. Dans Production, saisir un lot produit avec la date et la quantité.
5. Le cumul produit est contrôlé par le serveur ; il ne doit pas dépasser la quantité commandée.
6. Vérifier le statut de production visible dans Commandes.

### 5.4 Expédition

1. Planifier une quantité uniquement dans la limite de la quantité produite non livrée.
2. Renseigner la date, le chauffeur/porteur et la note si nécessaire.
3. Depuis Expédition, sélectionner la ligne de planning lorsqu’elle existe.
4. Enregistrer la quantité réellement livrée.
5. Vérifier le cumul et le reste à livrer.

Une commande annulée ne peut pas être expédiée. Une commande entièrement livrée passe à `Livrée` selon les cumuls des articles.

### 5.5 Études photométriques

Le Technique peut créer une étude liée à une commande ou indépendante :

- une étude liée sélectionne un article appartenant réellement à la commande ;
- une étude indépendante nécessite une affaire et un nom de produit ;
- la lentille est vérifiée côté serveur ;
- la création valide toutes les lignes avant insertion ;
- une étude peut être modifiée ou rattachée à une commande selon les droits ;
- un document d’étude peut être associé dans le stockage documentaire.

### 5.6 Export et import de commandes

**Export :** appliquer les filtres avant l’export, vérifier le périmètre et protéger le fichier produit. Un export peut contenir des clients, tarifs, besoins techniques et informations de production.

**Import :**

1. utiliser un modèle validé ;
2. importer d’abord en prévisualisation ;
3. contrôler les feuilles, en-têtes, mapping, couleurs, clients, agences, articles et quantités ;
4. corriger les lignes rejetées ;
5. ne sélectionner la création qu’après validation ;
6. conserver le compte rendu de l’opération.

Limite actuelle : fichier commande/archive de 25 Mo maximum. Les fichiers malformés ou trop complexes doivent être ouverts et nettoyés hors plateforme. La dépendance Excel reste une vulnérabilité surveillée : ne jamais importer un classeur provenant d’une source inconnue.

---

## 6. Référentiels et modules métier

### Clients et agences

- Client : nom, code unique, contact, téléphone, email, adresse et activation.
- Agence : nom, code unique, adresse et activation.
- Le code doit être stable : les commandes et historiques s’y réfèrent.
- Avant de créer, rechercher l’existant pour éviter les doublons.
- Désactiver plutôt que supprimer si l’entité possède un historique.

### Matières et catégories

Le Technique gère les catégories et les matières (référence, libellé, stock et spécifications). Les catégories par défaut sont installées de manière idempotente ; ne pas utiliser un import générique pour contourner les catégories techniques.

### Télégestion

La famille Télégestion peut être signalée sur un article et ses composants techniques sont suivis séparément. Le filtre de Commandes permet d’isoler les commandes concernées. Le Gérant consulte uniquement.

### Usines

Le Planificateur crée et maintient les usines, leur code, leur responsable et leur état actif. Une usine désactivée ne doit pas recevoir de nouveau planning. Les anciens enregistrements conservent une copie du nom pour l’historique.

### Archive

L’import Archive est réservé au Super Admin et n’écrase pas les commandes actives. Les feuilles, lignes, cellules vides, préambules, couleurs et états détectés sont conservés. Les modifications de ligne sont tracées ; un état manuel peut être remis sur automatique selon l’interface.

### Couleurs

Le Super Admin gère les couleurs transverses : états commandes, planning, archive et recouvrement. Une couleur est une préférence d’affichage, pas une autorisation et pas une modification d’état métier.

---

## 7. Documents et stockage Google Drive

### Organisation

Le stockage physique est Google Drive, dans le dossier racine applicatif. Les documents associés à une commande ou à une étude sont des associations logiques vers un fichier existant ; le fichier n’est pas dupliqué.

### Utilisation

1. Dans Stockage, naviguer dans le dossier autorisé.
2. Pour un nouvel envoi, sélectionner uniquement des PDF valides.
3. Respecter 50 Mo par fichier, 20 fichiers maximum par envoi et 500 Mo cumulés par envoi.
4. Depuis une commande ou une étude, associer le document à la bonne entité et choisir sa catégorie.
5. Utiliser l’aperçu ou le téléchargement via la plateforme ; ne pas rendre le fichier Drive public.
6. Renommer/déplacer uniquement si le rôle l’autorise et uniquement dans le dossier racine applicatif.

Le Gérant peut consulter, prévisualiser et télécharger, mais ne peut pas téléverser, renommer, déplacer, supprimer ou créer un dossier. En cas de quota atteint, OAuth expiré ou erreur Drive, prévenir le Super Admin.

### Précautions

- ne pas téléverser de secrets, mots de passe ou données personnelles inutiles ;
- vérifier le nom avant envoi ;
- ne pas supprimer un fichier qui possède plusieurs associations sans vérifier son usage ;
- conserver les fichiers sources dans la politique de sauvegarde de l’entreprise : le JSON de la base ne copie pas le contenu physique Drive ;
- une tentative de fichier ou dossier hors du stockage applicatif doit être refusée.

---

## 8. Recouvrement

### Affecter un état à un client

1. Ouvrir le tableau Clients ou le panneau prévu dans Commandes.
2. Sélectionner le client.
3. Choisir **Retard important** ou **Client Bloqué**.
4. Ajouter une note factuelle si besoin.
5. Enregistrer.
6. Vérifier l’alerte colorée dans les commandes.

Pour retirer l’état, utiliser l’action de retrait prévue. Chaque changement crée une ligne d’historique avec l’auteur, le libellé et la note.

### Modifier le catalogue

Le rôle Recouvrement ou le Super Admin peut modifier description, couleur, ordre et activation. Le libellé reste limité aux deux libellés métier exacts. Désactiver un état empêche une nouvelle affectation mais ne modifie pas l’historique existant.

---

## 9. Sauvegarde automatique, sauvegarde manuelle et restauration

### 9.1 Sauvegarde manuelle

1. Ouvrir **Sauvegarde** avec un compte Super Admin.
2. Lancer une sauvegarde manuelle.
3. Vérifier le nombre d’enregistrements et la taille.
4. Télécharger une copie hors de la base et la stocker dans un emplacement protégé.
5. Ne pas envoyer le JSON par email non chiffré.

Les sauvegardes n’exportent pas les condensats de mots de passe. Les fichiers Drive ne sont pas inclus dans le JSON.

### 9.2 Sauvegarde automatique

Le Super Admin configure :

- activation/désactivation ;
- heure quotidienne au format `HH:MM` ;
- nombre de sauvegardes conservées, de 1 à 365 ;
- délai d’inactivité, de 1 à 1 440 minutes.

Tester après toute modification. Vérifier l’historique, le statut, la date de dernière exécution, la taille et l’espace disponible de la base.

### 9.3 Restauration contrôlée

La restauration **remplace toutes les données actuelles**. Procédure obligatoire :

1. annoncer une fenêtre d’arrêt des saisies ;
2. faire une sauvegarde manuelle fraîche ;
3. télécharger cette sauvegarde hors de la base ;
4. vérifier le fichier et sa provenance ;
5. obtenir une validation du responsable ;
6. restaurer uniquement en environnement prévu ;
7. vérifier utilisateurs, agences, commandes, articles, planning, états, archive et configuration ;
8. communiquer le mot de passe temporaire éventuel par canal séparé et demander son changement immédiat ;
9. recharger la page et réaliser un test fonctionnel complet.

Ne jamais tester une restauration sur la production sans copie indépendante et autorisation explicite.

### 9.4 Réinitialisation contrôlée des commandes

Le bouton de réinitialisation administrateur demande le mot de passe courant et la confirmation exacte **REINITIALISER**. Il réinitialise les commandes, études et dépendances prévues, ainsi que le compteur de commandes, mais conserve les matières, clients et agences indiqués par l’interface. Cette action ne remplace pas une sauvegarde et doit être validée avant exécution.

---

## 10. Limites techniques et fonctionnelles

| Domaine | Limite actuelle | Consigne |
|---|---|---|
| Session | JWT nominal 12 h ; inactivité administrable 1–1 440 min | Se déconnecter manuellement d’un poste partagé. |
| Connexion | 5 échecs / 15 min par IP et identifiant, mémoire de l’instance | Prévoir un stockage partagé en multi-instance. |
| Import commande/archive | 25 Mo par fichier | Prévisualiser et fractionner les gros classeurs. |
| Import utilisateurs | 5 Mo et 500 lignes | Supprimer le fichier source après traitement sécurisé. |
| Import clients/agences | 5 Mo et 5 000 lignes | Utiliser seulement `.xlsx`, `.xls` ou `.csv`. |
| Stockage | PDF, 50 Mo/fichier, 20 fichiers, 500 Mo/envoi | Contrôler le quota Google Drive. |
| Stockage affichage | Pages Drive de 10 à 100 éléments | Utiliser la recherche et la navigation par dossier. |
| Production | Les cumuls sont bornés par les quantités commandées | Corriger la commande source, ne pas contourner l’API. |
| Expédition | Quantité livrable bornée par le produit non livré | Utiliser la ligne de planning active. |
| Commandes | Chargement et certains exports non paginés côté serveur | Prévoir une pagination pour un historique très volumineux. |
| Sauvegarde | Le JSON peut devenir volumineux et reste en base | Télécharger des copies indépendantes. |
| Excel | `xlsx` reste signalé niveau haut sans correctif npm | Fichiers de confiance uniquement et migration à planifier. |

---

## 11. Dépannage pratique

### « Identifiants invalides »

- vérifier la casse et le clavier ;
- attendre si la limite de tentatives est atteinte ;
- demander au Super Admin de vérifier que le compte est actif ;
- si le compte vient d’être créé, utiliser le mot de passe initial attribué et changer celui-ci immédiatement.

### « Changement de mot de passe requis »

Terminer le formulaire avant d’essayer d’ouvrir un module. Si le mot de passe initial a été exposé, demander une réinitialisation plutôt que de le réutiliser.

### Données absentes ou commande inaccessible

- vérifier l’agence sélectionnée et les filtres personnels ;
- cliquer sur Actualiser ;
- vérifier le rôle et le périmètre agence ;
- pour Accès agence, une commande hors agence doit rester invisible même avec son numéro ;
- pour Gérant, l’absence d’un onglet est normale.

### « Commande verrouillée »

Un autre utilisateur est en cours de modification. Attendre quelques minutes, recharger et vérifier l’auteur du verrou. Ne pas ouvrir plusieurs sessions avec le même compte.

### Import refusé

- vérifier l’extension et la taille ;
- utiliser le modèle officiel ;
- contrôler la ligne d’en-tête et les colonnes obligatoires ;
- vérifier les codes clients/agences ;
- fractionner un fichier volumineux ;
- ouvrir le fichier hors plateforme pour supprimer les feuilles ou formules inutiles ;
- ne pas multiplier les essais avec un classeur inconnu.

### Google Drive indisponible

1. vérifier la connexion et le statut dans Stockage ;
2. lancer le test Drive avec le Super Admin ;
3. vérifier le quota et l’expiration OAuth ;
4. ne pas modifier les identifiants dans le code ou la documentation ;
5. conserver les associations en base et réessayer après rétablissement.

### Sauvegarde ou restauration en erreur

- vérifier l’espace PostgreSQL ;
- vérifier l’historique et le statut ;
- ne pas relancer une restauration sans contrôler le fichier ;
- conserver la sauvegarde fraîche ;
- consulter les logs serveur, pas seulement le message navigateur ;
- escalader au responsable système si la transaction a échoué.

### Page blanche ou onglet qui charge sans fin

- recharger ;
- vérifier l’onglet et le réseau ;
- inspecter le healthcheck et les logs serveur ;
- vérifier que la base est accessible ;
- tester en navigation privée uniquement après avoir confirmé qu’aucune donnée sensible n’est affichée à l’écran.

---

## 12. Checklist administrateur

### À chaque création de compte

- [ ] compte nominatif et nom complet vérifiés ;
- [ ] rôle choisi selon la responsabilité réelle ;
- [ ] agences affectées uniquement si `Accès agence` ;
- [ ] mot de passe transmis hors ticket partagé ;
- [ ] changement obligatoire confirmé à la première connexion ;
- [ ] compte testé avec une opération de lecture et une opération refusée.

### Chaque jour

- [ ] healthcheck et connexion disponibles ;
- [ ] sauvegarde automatique de la veille en succès ;
- [ ] erreur Google Drive surveillée ;
- [ ] notifications et anomalies de production examinées ;
- [ ] aucun fichier Excel inconnu en attente de traitement.

### Chaque semaine

- [ ] sauvegarde manuelle téléchargée hors base ;
- [ ] taille et nombre d’enregistrements comparés à la semaine précédente ;
- [ ] revue des comptes actifs et des affectations agence ;
- [ ] revue Watchdog des opérations sensibles ;
- [ ] revue des fichiers Drive volumineux et des associations orphelines ;
- [ ] revue de `npm audit` sur une branche de maintenance.

### Chaque mois ou après évolution

- [ ] test de restauration sur environnement dédié ;
- [ ] test d’un compte par rôle ;
- [ ] test Accès agence sur une agence autorisée et une agence interdite ;
- [ ] test lecture seule Gérant : tentative de création, modification, suppression et déplacement ;
- [ ] test cycle commande → production → expédition ;
- [ ] test recouvrement, y compris suppression d’un état affecté ;
- [ ] tests `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` ;
- [ ] vérification qu’aucun secret, mot de passe ou fichier `.env` n’est commité.

---

## 13. Responsabilités d’exploitation

- **Système/administration :** secrets d’environnement, PostgreSQL, déploiement, sauvegardes, restauration, OAuth, mises à jour et journalisation.
- **Super Admin applicatif :** comptes, rôles, agences, paramètres, couleurs, référentiels, contrôle des imports et validation des opérations destructives.
- **Commercial :** exactitude des clients, agences, affaires, états commerciaux, articles et quantités commandées.
- **Technique :** exactitude des spécifications, matières, télégestion, études et documents techniques.
- **Planification :** cohérence usine/date/quantité prévue, production réellement saisie et expéditions réellement chargées.
- **Recouvrement :** états clients, notes de suivi et traçabilité des relances.
- **Gérant :** consultation et signalement des anomalies, sans modifier les données.
- **Tous les utilisateurs :** confidentialité, déconnexion, vérification avant validation et signalement immédiat d’une anomalie ou d’un accès inattendu.

---

## 14. Référence de validation de cette version

La version auditée a été vérifiée localement avec :

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

La dépendance `xlsx` reste explicitement ouverte dans le rapport d’audit. Avant toute mise en production ou tout push final, effectuer la synchronisation demandée avec `main`, puis relancer les quatre validations et examiner précisément le diff.
