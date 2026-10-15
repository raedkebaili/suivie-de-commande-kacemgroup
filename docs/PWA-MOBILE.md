# Order Track Pro — Version mobile (PWA)

Application installable sur Android et iPhone, **sans boutique d'applications** et **sans service payant**.
Elle utilise le même site, la même base de données et les mêmes API que la version ordinateur.

## Adresses

- Version mobile : `/mobile` (c'est elle que l'application installée ouvre).
- Version ordinateur : `/` (inchangée).

## Installation

### Android (Chrome, Edge ou Samsung Internet)
1. Ouvrir l'adresse du site, puis `/mobile`.
2. Se connecter avec son compte habituel.
3. Menu ⋮ → **« Installer l'application »** (ou « Ajouter à l'écran d'accueil »).
4. L'icône **Order Track Pro** apparaît sur l'écran d'accueil ; elle s'ouvre en plein écran, sans barre du navigateur.

### iPhone (Safari uniquement)
1. Ouvrir l'adresse du site **dans Safari**, puis `/mobile`.
2. Se connecter.
3. Bouton **Partager** ⬆︎ → **« Sur l'écran d'accueil »** → **Ajouter**.
4. Ouvrir l'icône depuis l'écran d'accueil (et non depuis Safari).

> Sur iPhone, l'installation n'est possible que depuis Safari. Chrome sur iOS ne propose pas cette fonction.

## Ce que contient la version mobile

- **Accueil** : chiffres du tableau de bord (commandes, états, quantités, avancement).
- **Commandes** : cartes, recherche (n°, client, agence, affaire ; accents ignorés), filtres d'état et de priorité.
- **Fiche commande** : sections Informations, Priorité et état, Articles, Planification. Chaque article affiche ses anciennes spécifications textuelles et ses composants, avec auteur et date.
- **Composants techniques** (Technique et Super Admin) : édition par article, recherche référence/libellé, filtre catégorie, sélection multiple, retrait, annulation et sauvegarde via l’API existante. Les matières déjà associées mais absentes du catalogue actif sont conservées tant qu’elles ne sont pas retirées explicitement.
- **Formulaire de planification** (responsable planification et superadmin) : priorité, état, motif, cause d'annulation.
  - Le responsable planification choisit « En instance » ou « Annulée ». « En production » et « Livrée » se soldent dans les plannings accessibles depuis Plus.
- **Saisie commerciale** : nouvelle commande depuis Commandes ou Plus ; modification depuis la fiche (Commercial et Super Admin). Date, client, agence, affaire, état commercial, désignation, quantités, prix unitaires, besoin client, notes, télégestion et ajout d’articles. Le rôle Planification peut créer uniquement « Sur Stock / Besoin interne ». Le numéro est attribué par le serveur. Les champs techniques et les champs de planification existants sont conservés.
- **Documents** : liste dans la fiche commande, ouverture/téléchargement, envoi de fichiers (formats et limite de 50 Mo partagés avec le serveur), association de fichiers du stockage via recherche paginée, dissociation avec confirmation. Ajout pour Super Admin, Commercial et Technique ; retrait pour l’auteur ou Super Admin, hors rôles en consultation. Le fichier reste dans le stockage après dissociation. Google Drive doit être configuré ; les erreurs de configuration ou d’envoi sont affichées.
- **Planning production** : depuis Plus, consultation par journée, recherche (article, commande, client, usine), accès aux commandes ; gestion pour Super Admin/Planification, consultation aussi pour Consultant Prod et Gérant. Ajout par article depuis la fiche commande avec date, usine et quantité. Modification de la quantité, du statut et du motif ; motif obligatoire pour Suspendu/Annulé. Confirmation avant Terminé (application de la production réelle) et Annulé.
- **Planning d’expédition** : depuis Plus, consultation par journée et recherche, accès aux commandes ; gestion pour Super Admin/Planification, consultation aussi pour Gérant. Ajout depuis la fiche avec date, quantité, chauffeur et note. Modification de la date, du chauffeur, de la quantité, du statut et de la note. Le stock disponible est produit moins livré ; le serveur vérifie à nouveau lors de la validation. Confirmation avant Livré (application au cumul réel). Les lignes appliquées ne sont plus éditables sur mobile.
- **Plus** : accès à « Mon compte », aide à l’installation Android/iPhone et lien vers la version ordinateur. Les autres modules restent accessibles dans cette dernière selon les droits existants.
- **Notifications** (depuis Plus, tous les rôles) : liste personnelle, compteur non lu, marquage lu/non lu, ouverture de la fiche commande et chargement progressif (jusqu’aux 500 dernières notifications). Les erreurs de lecture/écriture sont affichées, sans modification optimiste des données.
- **Clients** (depuis Plus, superadmin/commercial/recouvrement) : annuaire en cartes, recherche insensible aux accents, coordonnées avec liens téléphone/e-mail, statut et adresse.
- **Agences** (depuis Plus, superadmin/commercial) : annuaire en cartes, recherche, code, statut et adresse.
- **Mon compte** (depuis Plus) : profil et déconnexion, avec un bouton « Retour à Plus ». L’onglet Plus reste actif pendant la consultation du compte.

Les règles d'accès et de statut sont celles du serveur. L'interface ne fait qu'afficher ce qui est permis.

## Fonctionnement hors ligne

**Non pris en charge.** L'application nécessite une connexion internet. Seuls les fichiers statiques (scripts, styles, icônes) sont gardés en cache pour accélérer le démarrage ; aucune donnée de commande, aucune réponse de l'API et aucune page n'est mise en cache.

## Sécurité

- Le service worker (`/sw.js`) n'intercepte pas les appels `/api/…` : ils passent directement au réseau.
- Les téléchargements de fichiers (stockage, sauvegardes, exports) ne sont pas touchés.
- La session repose sur le cookie httpOnly existant (12 h), revalidé en base à chaque appel. Le délai d'inactivité configuré par l'administration s'applique aussi sur mobile.
- Aucune clé, aucun secret ni chaîne de connexion n'est présent dans le manifeste, le service worker ou les pages mobiles.

## Vérifications à faire après déploiement (checklist)

| Vérification | Attendu |
|---|---|
| `https://<site>/manifest.webmanifest` | JSON valide, nom « Order Track Pro », `start_url` `/mobile`, `display` `standalone` |
| `https://<site>/sw.js` | Fichier JavaScript, `Cache-Control: no-cache` |
| Android : installation | Icône « Order Track Pro », ouverture plein écran |
| iPhone : installation depuis Safari | Icône « Order Track Pro », ouverture plein écran |
| Ouverture `/mobile` non connecté | Redirection vers la connexion, puis retour sur `/mobile` |
| Session | Après 12 h ou inactivité, retour à la connexion ; pas de données affichées |
| Téléchargement d'un fichier (stockage) sur la version ordinateur | Fonctionne comme avant |
| Version ordinateur `/` | Interface et comportement inchangés |
| Rotation et encoches iPhone | Barres de navigation non masquées (safe-area) |

## Mise à jour

Chaque nouveau déploiement est pris en compte automatiquement : le service worker est vérifié à chaque ouverture (`no-cache`) et remplacé dès qu'il change. Si l'application installée affiche encore une ancienne version, la fermer complètement puis la rouvrir.

## Limites connues

- Pas de publication dans les boutiques, pas d'application native : c'est volontaire.
- La suppression des articles existants, la suppression de commandes et les imports/exports de masse restent sur ordinateur. Les lignes de planning dont les quantités sont déjà appliquées sont en consultation sur mobile.
- Le rendu n'a pas été vérifié sur de vrais appareils dans cet environnement : la checklist ci-dessus doit être faite sur un Android et un iPhone réels.

## Vérification du menu Plus

Sur un écran étroit, connecté avec chaque rôle :

1. Vérifier les trois onglets Accueil, Commandes et Plus (zones tactiles ≥ 44 px).
2. Ouvrir Plus puis Mon compte : vérifier le profil, le retour à Plus et l’onglet actif.
3. Depuis une fiche commande, toucher Plus : la fiche se ferme et le menu apparaît.
4. Vérifier l’aide Android/iPhone et le lien Version ordinateur (`/?bureau=1`).
5. Vérifier le mode sombre et la navigation clavier (focus visible des raccourcis).
6. Se déconnecter depuis Mon compte : retour à la connexion mobile.

## Vérification des nouveaux écrans du menu Plus

- Tous les rôles : Notifications et Mon compte visibles. Clients visible seulement pour superadmin, commercial et recouvrement ; Agences pour superadmin et commercial.
- Notifications : actualiser, charger la suite, marquer lu/non lu, ouvrir une commande puis revenir aux notifications. Vérifier les messages en cas de refus d’accès ou d’échec réseau.
- Annuaires : rechercher par nom/code et coordonnées client ; tester une recherche accentuée, un résultat vide, les liens téléphone/e-mail et « Afficher plus ».
- Vérifier le retour à Plus, les zones tactiles, le mode sombre et le retour à la connexion en cas de session expirée.

### Périmètre restant

Les annuaires mobiles sont en lecture seule. La création/modification des clients et agences, l’édition des anciennes spécifications textuelles, les archives, le recouvrement, la gestion complète du stockage et l’administration restent dans la version ordinateur. Les écrans ajoutés réutilisent les API existantes et ne changent ni les droits serveur ni le périmètre agence.

## Vérification des composants techniques sur mobile

1. Ouvrir une commande contenant plusieurs articles : vérifier les spécifications textuelles, les composants et leur traçabilité.
2. Avec Technique ou Super Admin, toucher « Modifier les composants » sur un article. Rechercher une référence, filtrer une catégorie, sélectionner plusieurs matières puis enregistrer.
3. Recharger : vérifier les composants enregistrés et vérifier que les autres articles, quantités et champs commerciaux sont inchangés.
4. Retirer un composant, annuler, puis rouvrir : la sélection serveur doit être intacte. Tester aussi le retrait de tous les composants.
5. Vérifier qu’une matière inactive déjà sélectionnée est conservée et peut être retirée explicitement.
6. Avec les autres rôles : les spécifications sont consultables, sans bouton d’édition technique.
7. Tester une erreur réseau, une session expirée et un verrou détenu par un autre utilisateur : erreur affichée, brouillon conservé en cas d’échec d’écriture, possibilité de réessayer.

La sélection du catalogue affiche au maximum 50 résultats à la fois ; une recherche permet de retrouver les autres matières. Le serveur conserve les règles de verrouillage, de traçabilité et de notification existantes.

## Recette documents, plannings et saisie commerciale

Les tests automatisés utilisent des API simulées ; la recette réelle doit être effectuée avec une base de test et un stockage Drive de test, car les validations de planning appliquent de vraies quantités.

1. **Commercial / Super Admin** : depuis Commandes → Nouvelle commande, saisir date, client, agence, état et plusieurs articles ; vérifier le numéro généré et l’ouverture de la fiche. Modifier les informations et ajouter un article ; vérifier que les spécifications techniques, usines, dates de chargement et descriptions existantes sont conservées. Tester une quantité non entière, nulle ou inférieure au cumul produit/livré.
2. **Planification** : créer une commande Sur Stock sans agence ; vérifier l’agence interne attribuée par le serveur et l’absence des deux autres états commerciaux. Vérifier qu’il n’y a pas d’édition commerciale des commandes existantes pour ce rôle.
3. **Brouillons commerciaux** : quitter via Annuler ou la navigation du bas et refuser la confirmation ; le formulaire doit rester ouvert. Une navigation est bloquée pendant l’enregistrement. Le navigateur est averti lors d’une fermeture/recharge avec une saisie non enregistrée (selon les restrictions du navigateur mobile). Tester un verrou serveur : erreur visible et brouillon conservé.
4. **Documents** : envoyer un PDF et une image, choisir leur catégorie, ouvrir/télécharger ; rechercher un fichier existant et l’associer sans le dupliquer. Refuser puis accepter une dissociation ; vérifier que le fichier reste dans Stockage. Tester format interdit, fichier vide, absence de Drive configuré et droits de consultation.
5. **Production** : ajouter un article à une journée/usine depuis sa fiche ; le retrouver dans Plus → Planning production. Tester recherche, quantité, mise en cours, suspension sans/avec motif. Refuser puis confirmer Terminé ; vérifier le cumul produit côté commande et l’absence de bouton d’édition une fois appliqué. Tester un doublon : le refus doit être affiché, jamais annoncé comme un succès.
6. **Expédition** : sur un article déjà produit, planifier une quantité disponible, un chauffeur et une date. Modifier la ligne, puis refuser/confirmer Livré ; vérifier le cumul livré et le verrouillage de la ligne mobile. Tester quantité supérieure au stock et doublons, avec erreurs serveur affichées.
7. **Droits / appareils** : Gérant en consultation des deux plannings, Consultant Prod du seul planning production ; pas de raccourci de gestion pour les autres rôles. Tester en mode sombre, sur Android/iPhone, sur réseau lent et avec une session expirée.

Les fonctions de suppression des lignes de planning et des articles existants, les exports et les opérations groupées ne sont pas exposées dans cette interface mobile.
