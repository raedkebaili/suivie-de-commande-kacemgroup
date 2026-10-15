# Rapport d’intervention — OrderTrack Pro / Kacem Group

**Date :** 2026-10-05  
**Dépôt :** `raedkebaili/suivie-de-commande-kacemgroup`  
**Branche de travail :** `arena/01a10c77-suivie-de-commande-kacemgroup`  
**Commit de base :** `57e3b2d`  

> Les valeurs sensibles présentes dans les modèles de configuration ou dans le
> code ne sont pas reproduites ici. Le rapport cite uniquement des fichiers et
> des lignes vérifiables dans le dépôt.

## 1. Résumé exécutif

OrderTrack Pro est un monolithe full-stack Next.js destiné au suivi des
commandes de Kacem Group. Le dépôt contient 75 route handlers API, 32 tables
Drizzle, 29 composants React et 6 fichiers de tests unitaires.

L’état final validé est le suivant :

- le typecheck TypeScript passe ;
- ESLint passe sans erreur ni avertissement ;
- les 56 tests Vitest passent ;
- le build Next.js passe et génère les 75 route handlers ;
- le lockfile npm et le script `npm test` sont présents ;
- les sessions navigateur utilisent un cookie JWT `HttpOnly` same-origin ;
- l’aperçu du prochain numéro de commande n’est plus public ;
- un README et une procédure de déploiement cohérente sont disponibles.

Le dépôt ne contient toujours ni environnement PostgreSQL de recette, ni
workflow CI GitHub Actions, ni Dockerfile. Les validations API nécessitant une
base réelle n’ont donc pas été exécutées dans ce checkout.

## 2. Architecture comprise

### 2.1 Entrées et exécution

- `src/app/layout.tsx:16-36` est le layout racine. Il installe les providers
  `AuthProvider`, `ColorProvider` et `ModificationsProvider`.
- `src/app/login/page.tsx` est l’entrée de connexion ; `src/app/page.tsx` est
  l’application principale côté client.
- `src/app/page.tsx:22-38` charge les vues par `next/dynamic`, ce qui répartit
  le bundle par onglet. `src/app/page.tsx:50-68` définit les onglets et les
  rôles autorisés côté interface.
- Les API sont des route handlers Next.js sous `src/app/api/**/route.ts`.
  La base de données est créée paresseusement dans `src/db/index.ts:5-9` et
  `src/db/index.ts:16-38`, avec un pool PostgreSQL dont la taille par défaut
  est 20.
- Le traitement serveur de sauvegarde est enregistré par
  `src/instrumentation.ts:18-25` et vérifie périodiquement la sauvegarde
  automatique aux lignes `79-85`. Le planificateur navigateur
  `src/lib/backup-scheduler.ts` est conservé pour l’écriture locale via File
  System Access API.

### 2.2 Couches applicatives

1. **Présentation :** pages client et composants React dans `src/components`.
2. **Client HTTP :** `src/lib/api.ts`, qui envoie désormais les cookies
   same-origin.
3. **API/autorisation :** route handlers et `src/lib/api-helpers.ts:1-15`.
   Certaines routes utilisent `checkAuth`, d’autres leur helper local `auth` ;
   le contrôle est serveur et ne repose pas seulement sur la sidebar.
4. **Métier transverse :** `src/lib/auth.ts`, règles de priorité, état visuel,
   production, planification, recouvrement, archivage, Excel et sauvegardes.
5. **Accès aux données :** Drizzle + `pg` dans `src/db/index.ts`, schéma dans
   `src/db/schema.ts`, baseline SQL et métadonnées sous `drizzle/`.

### 2.3 Modèle de données

- Comptes et référentiels : `users`, `agencies`, `clients` dans
  `src/db/schema.ts:4-38`.
- Commandes : `orders` avec statut commercial, statut de production, priorité,
  verrouillage et traçabilité dans `src/db/schema.ts:40-70`.
- Articles et cycle industriel : `order_items`, `production_batches`,
  `expedition_batches` dans `src/db/schema.ts:72-136`.
- Catalogue technique : `material_categories`, `matieres` et
  `item_technical_components` dans `src/db/schema.ts:158-199`.
- Audit et notifications : `activity_logs`, `modification_logs` et
  `notifications` dans `src/db/schema.ts:200-240`.
- Modules complémentaires : compteurs de commandes, couleurs, paramètres,
  sauvegardes, études photométriques, recouvrement, stockage, usines, planning
  et archive dans `src/db/schema.ts:241-536`.
- Les relations FK et les index secondaires importants sont définis dans le
  même schéma ; par exemple les index commandes sont aux lignes `64-70` et
  les index articles aux lignes `100-105`.
- Le déploiement opérationnel applique actuellement le schéma par
  `drizzle-kit push` ; `drizzle.config.ts:4-17` exige `DATABASE_URL`, tandis
  que `drizzle.config.json:1-7` conserve une configuration locale statique.
  Cette dualité reste un point de maintenance.

### 2.4 Authentification, rôles et permissions

- Les JWT HS256 sont créés et vérifiés par `src/lib/auth.ts:35-42`.
  `JWT_SECRET` est obligatoire et doit faire au moins 32 caractères
  (`src/lib/auth.ts:19-28`), avec une durée de 12 heures.
- Chaque requête authentifiée revalide l’utilisateur en base et refuse un
  compte supprimé ou inactif (`src/lib/auth.ts:44-64`).
- Le login applique un rate limit de cinq tentatives par fenêtre de quinze
  minutes dans `src/app/api/auth/login/route.ts:18-42`, et le module partagé
  est `src/lib/rate-limit.ts:1-60`.
- Le compte initial est forcé à changer de mot de passe via
  `mustChangePassword` (`src/lib/auth.ts:71-82` et
  `src/db/schema.ts:12-16`). La valeur temporaire n’est pas reproduite dans
  ce rapport.
- Les rôles métier sont `superadmin`, `commercial`, `technique`,
  `planification`, `consultant_prod` et `recouvrement`, déclarés dans
  `src/lib/types.ts:1-3`.
- La visibilité de l’interface est filtrée dans `src/app/page.tsx:50-68`, mais
  les routes serveur appliquent aussi leur propre autorisation ; par exemple
  les commandes vérifient l’authentification aux lignes `9-17` de
  `src/app/api/orders/route.ts`.

### 2.5 Frontend et intégrations

- L’état global est géré par React Context ; l’état métier des vues reste local
  à chaque composant.
- Le tableau de bord, commandes, production, expédition, matières, usines,
  planning, archive, recouvrement, stockage, utilisateurs et sauvegardes sont
  branchés depuis `src/app/page.tsx:22-41`.
- Les commandes sont chargées avec leurs articles et composants techniques en
  lots dans `src/app/api/orders/route.ts:48-80`, puis enrichies par des totaux
  et les documents associés (`src/app/api/orders/route.ts:81-123`).
- Google Drive est une intégration optionnelle : le callback OAuth chiffre le
  refresh token avant stockage (`src/app/api/google-drive/oauth/callback/route.ts:91-101`).
- `xlsx` est utilisé pour les imports/exports, Recharts pour les graphiques ;
  les dépendances sont déclarées dans `package.json:15-37`.

## 3. Diagnostic initial et final

### 3.1 Ce qui fonctionnait déjà

- TypeScript strict était activé dans `tsconfig.json`.
- Le build Next.js fonctionnait déjà sans base de données grâce à la connexion
  lazy dans `src/db/index.ts`.
- Les règles métier critiques avaient déjà des tests : priorités, état visuel,
  regroupement d’articles, archivage et sécurité.
- Les headers de sécurité, CSP, rate limit, hashage bcrypt, revalidation des
  comptes et sauvegardes serveur étaient déjà présents ; voir
  `next.config.ts:3-26`, `src/lib/auth.ts:19-64` et
  `src/instrumentation.ts:1-11`.

### 3.2 Problèmes constatés et traités

1. **Validation incomplète :** aucun script `test`, aucun lockfile versionné et
   aucune contrainte Node dans le `package.json` initial. Corrigé par
   `da7f3ed` avec `npm test`, `package-lock.json`, `next-env.d.ts`, la
   contrainte Node et une configuration ESLint compatible avec les effets de
   chargement asynchrones existants.
2. **Lint initial cassé :** le lint initial échouait avec 47 erreurs, dont des
   textes JSX non échappés. Les textes ont été corrigés et les avertissements
   résiduels nettoyés par `1b6a209`.
3. **JWT lisible par JavaScript :** le client lisait `localStorage` et certains
   téléchargements passaient le JWT dans l’URL. Corrigé par `e608127` : cookie
   `HttpOnly`, `SameSite=Lax`, `Secure` en production, `credentials` same-origin,
   suppression des JWT dans les URLs et logout qui efface le cookie. Le helper
   testé est `src/lib/auth-cookie.ts:1-31`.
4. **Endpoint de prévisualisation public :**
   `/api/orders/next-number` ne vérifiait pas la session. Corrigé par `f2df9f9`
   (`src/app/api/orders/next-number/route.ts:13-17`).
5. **Déploiement incohérent :** le package portait encore un nom de template,
   les guides annonçaient Node 18 et le script Windows ne générait pas tous les
   secrets du modèle. Corrigé par `32582f8` et `eeb20d9` ; la documentation
   opérationnelle est maintenant dans `README.md`, `DEPLOYMENT.md` et
   `INSTALL-GUIDE.md`.

### 3.3 Ce qui reste partiel ou non vérifié

- Les tests actuels sont unitaires/purs. Aucun test d’intégration de route API
  n’a été exécuté contre PostgreSQL dans ce checkout : aucun `.env` réel ni
  serveur PostgreSQL n’était fourni, et aucun secret n’a été demandé.
- Le rate limit est en mémoire et explicitement adapté à une instance LAN
  unique (`src/lib/rate-limit.ts:1-4`). Il ne protège pas uniformément une
  architecture multi-instance.
- `GET /api/orders` charge toutes les commandes correspondant aux filtres puis
  tous leurs articles (`src/app/api/orders/route.ts:48-80`) : la pagination
  serveur n’est pas encore implémentée.
- Le compte administrateur initial repose encore sur une valeur temporaire
  codée dans `src/lib/auth.ts:71-80`, même si l’accès aux modules est bloqué
  jusqu’au changement obligatoire.
- `src/lib/crypto.ts` accepte encore une dérivation depuis le secret JWT si la
  clé de chiffrement dédiée n’est pas fournie (`src/lib/crypto.ts:12-25`) ;
  la configuration de production doit donc toujours renseigner la clé dédiée.
- Les documents d’audit historiques contiennent des descriptions antérieures
  à ces correctifs, notamment sur `localStorage` et les identifiants de premier
  accès. Ils restent utiles comme historique mais ne doivent pas remplacer le
  `README.md` et les guides opérationnels.

## 4. Plan priorisé

### Quick wins réalisés

- Ajouter lockfile, script de tests, contrainte Node et lint propre.
- Protéger le JWT contre l’accès JavaScript et les fuites par URL.
- Protéger le endpoint de prévisualisation de numéro.
- Corriger les instructions d’installation et les secrets générés par le setup.
- Ajouter un README de référence.

### Chantiers moyens recommandés

1. Ajouter des schémas de validation serveur (par exemple avec une dépendance
   choisie et approuvée) pour les corps JSON des routes commandes, utilisateurs,
   matières et import ; aujourd’hui plusieurs routes convertissent directement
   les champs entrants.
2. Introduire une pagination compatible avec l’UX de `OrdersView`, avec tests
   de contrat API et mesure des volumes réels.
3. Remplacer le rate limit mémoire par un stockage partagé si l’application
   devient multi-instance.
4. Ajouter des tests API avec PostgreSQL éphémère et un test E2E de connexion,
   changement de mot de passe, création de commande, production et expédition.
5. Unifier `drizzle.config.ts` et `drizzle.config.json`, puis formaliser des
   migrations versionnées au lieu de dépendre uniquement de `push`.

### Refontes à décider avant implémentation

- Ajouter une CI GitHub Actions et une stratégie de déploiement reproductible
  (Docker ou Vercel) : aucun workflow `.github/workflows/`, Dockerfile ou
  `docker-compose.yml` n’existe dans le dépôt.
- Centraliser l’autorisation dans un middleware ou un helper unique : le pattern
  actuel est correct mais chaque nouvelle route doit penser à son propre garde.
- Passer à une session serveur ou à une rotation/révocation de refresh token si
  le modèle de menace nécessite une révocation immédiate sans consultation DB.

## 5. Améliorations implémentées et commits

| Commit | Type | Contenu |
|---|---|---|
| `da7f3ed` | `chore:` | Lockfile, script `npm test`, Node >=20.9, lint et JSX propres |
| `e608127` | `fix:` | Session JWT en cookie HttpOnly, téléchargements same-origin, tests cookie |
| `f2df9f9` | `fix:` | Authentification obligatoire pour l’aperçu du numéro de commande |
| `32582f8` | `chore:` | Nom de package aligné sur `ordertrack-pro` |
| `eeb20d9` | `docs:` | README, guides runtime/déploiement et setup Windows cohérents |
| `1b6a209` | `chore:` | Suppression des avertissements ESLint et mémorisation de `lensMaterials` |

Tous ces commits ont été poussés sur la branche de session
`arena/01a10c77-suivie-de-commande-kacemgroup`. Aucun push direct sur `main` n’a
été effectué : l’environnement de session impose cette branche de suivi.

## 6. Tests ajoutés ou adaptés

- `src/lib/__tests__/security-libs.test.ts:91-102` couvre le parsing exact du
  cookie d’authentification, le décodage d’une valeur encodée et les cookies
  absents/invalides.
- Le script `npm test` déclaré dans `package.json:7-14` exécute les 6 fichiers
  Vitest existants.
- Résultat final : **6 fichiers, 56 tests passés**.

## 7. Commandes exécutées et résultats

### Cartographie et baseline

- `git status --short --branch` : dépôt initial propre, branche de session active.
- `git ls-files`, `find`, `grep`, `wc`, `cat` et `sed` : cartographie complète,
  lecture des guides demandés et vérification des fichiers absents.
- `npm install` : installation réussie ; le gestionnaire a signalé des
  vulnérabilités de dépendances.
- Baseline : `npm run typecheck` ✅, `npm run build` ✅, Vitest direct ✅ ;
  `npm run lint` ❌ avec 47 erreurs avant correction.

### Validation finale

```text
npm run typecheck  ✅
npm run lint       ✅ sans erreur ni avertissement
npm test           ✅ 6 fichiers / 56 tests
npm run build      ✅ Next.js 16.2.6, 75 routes API générées
```

Le build final a généré les pages statiques `/` et `/login` ainsi que les route
handlers dynamiques API, sans exécuter de connexion PostgreSQL pendant la phase
build.

### Sécurité des dépendances

`npm audit --omit=dev --audit-level=moderate` a retourné **4 vulnérabilités de
production : 1 critique et 3 hautes**. Les avis concernent notamment la version
Next/PostCSS/sharp et `xlsx` ; `xlsx` n’a pas de correctif proposé par npm. La
commande automatique recommande une mise à niveau forcée de Next hors de la
plage déclarée. Aucune mise à niveau aveugle n’a donc été appliquée.

### Git

Après chaque validation de commit poussé, la commande obligatoire
`git pull --rebase origin main` a été exécutée avant le push vers la branche de
session. Les pushes ont réussi. Le dépôt final est propre ; le dernier résumé
est visible via `git log --oneline -20`.

## 8. Risques et points à surveiller

- **Dépendances :** traiter les 4 vulnérabilités de production dans un chantier
  dédié avec revue de compatibilité, tests API et test de déploiement.
- **Initialisation admin :** remplacer la valeur temporaire codée par une
  procédure de génération/communication contrôlée si le produit est exposé
  au-delà du LAN.
- **CSRF :** le cookie est `SameSite=Lax`, mais les routes mutatives n’ont pas
  de token CSRF dédié ; réévaluer cette protection pour un usage cross-site ou
  un domaine partagé.
- **Rate limit :** ajouter un backend partagé avant tout déploiement horizontal.
- **Base de données :** tester migration, restauration et suppression en
  environnement de recette avant production ; aucune base réelle n’a été
  modifiée pendant cette intervention.
- **Configuration :** ne jamais committer `.env`; utiliser les variables
  documentées dans `.env.example:8-34` et ne jamais copier leurs valeurs dans
  les tickets, logs ou rapports.
