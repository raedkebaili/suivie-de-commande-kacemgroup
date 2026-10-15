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
- **Fiche commande** : sections Informations, Priorité et état, Articles, Planification.
- **Formulaire de planification** (responsable planification et superadmin) : priorité, état, motif, cause d'annulation.
  - Le responsable planification choisit « En instance » ou « Annulée ». « En production » et « Livrée » se soldent dans le planning (version ordinateur).
- **Plus** : accès à « Mon compte », aide à l’installation Android/iPhone et lien vers la version ordinateur. Les autres modules restent accessibles dans cette dernière selon les droits existants.
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
- Les modifications complètes de commande (articles, spécifications techniques, création) restent sur la version ordinateur.
- Le rendu n'a pas été vérifié sur de vrais appareils dans cet environnement : la checklist ci-dessus doit être faite sur un Android et un iPhone réels.

## Vérification du menu Plus

Sur un écran étroit, connecté avec chaque rôle :

1. Vérifier les trois onglets Accueil, Commandes et Plus (zones tactiles ≥ 44 px).
2. Ouvrir Plus puis Mon compte : vérifier le profil, le retour à Plus et l’onglet actif.
3. Depuis une fiche commande, toucher Plus : la fiche se ferme et le menu apparaît.
4. Vérifier l’aide Android/iPhone et le lien Version ordinateur (`/?bureau=1`).
5. Vérifier le mode sombre et la navigation clavier (focus visible des raccourcis).
6. Se déconnecter depuis Mon compte : retour à la connexion mobile.
