# Audit technique — OrderTrack Pro (Kacem Group)

Documentation d'audit produite après **clonage fidèle** du dépôt
`github.com/raedkebaili/suivie-de-commande-kacemgroup` (branche `main`,
commit **`a66d242`** — « UPLOAD SPECIFICATIONS INTEGRATIONS »).

> **Aucune ligne du projet audité n'a été modifiée.** Le dépôt reste la
> source de vérité. Chaque affirmation de ce dossier est adossée à un
> fichier du code, relu indépendamment pendant l'audit.

## Chiffres vérifiés

| Métrique | Valeur | Source |
|---|---|---|
| Framework | Next.js **16.2.6** (App Router), React **19.2.6** | `package.json` |
| Langage | TypeScript **5.9.3** en mode `strict` | `tsconfig.json` |
| Tables PostgreSQL | **32** (Drizzle ORM 0.45.2, stratégie `push`) | `src/db/schema.ts` |
| Routes API | **73** handlers (toutes `force-dynamic`, runtime Node) | `src/app/api/**/route.ts` |
| Composants React | **27** (SPA à 17 onglets) | `src/components/` |
| Modules `src/lib` | **29** | `src/lib/` |
| Rôles utilisateurs | **6** : `superadmin`, `commercial`, `technique`, `planification`, `consultant_prod`, `recouvrement` | `src/app/page.tsx`, routes API |
| Historique git | 17 commits, 1 branche, 0 tag | `git log` |

## Sommaire

| Document | Contenu | Phase |
|---|---|---|
| [00-CARTOGRAPHIE.md](00-CARTOGRAPHIE.md) | Stack, versions, dépendances, configuration, variables d'environnement, scripts npm, build, stratégies de déploiement | Phase 1 |
| [01-ARCHITECTURE.md](01-ARCHITECTURE.md) | Frontend, backend, API, providers, libs métier, rôles, tâches automatiques — rôle de chaque partie | Phase 2 |
| [02-BASE-DE-DONNEES.md](02-BASE-DE-DONNEES.md) | Schéma relationnel complet : 32 tables, relations, contraintes, index, règles en base | Phase 3 |
| [03-API.md](03-API.md) | Les 73 endpoints : objectif, paramètres, droits, règles métier, erreurs, accès base | Phase 4 |
| [04-LOGIQUE-METIER.md](04-LOGIQUE-METIER.md) | Cycles de vie, workflows inter-services, règles de calcul, changements d'état, règles implicites | Phase 5 |
| [05-SECURITE.md](05-SECURITE.md) | Rapport de sécurité : authentification, JWT, contrôle d'accès, injections, secrets, vulnérabilités classées | Phase 6 |
| [06-PERFORMANCES.md](06-PERFORMANCES.md) | Requêtes, index, N+1, pagination, bundle, cache — optimisations sans changement fonctionnel | Phase 7 |
| [07-QUALITE-CODE.md](07-QUALITE-CODE.md) | Patterns, typage, conventions, erreurs, journalisation, maintenabilité, dette | Phase 8 |
| [08-BUILD-DEPLOIEMENT.md](08-BUILD-DEPLOIEMENT.md) | Build, scripts, installation Windows, sauvegardes/restaurations, healthcheck, Docker/CI (absents) | Phase 9 |
| [09-GUIDES.md](09-GUIDES.md) | Guides d'installation, déploiement, configuration, maintenance et dépannage | Phase 10 |
| [10-RISQUES-AMELIORATIONS.md](10-RISQUES-AMELIORATIONS.md) | Analyse des risques, dette technique consolidée, opportunités priorisées, questions ouvertes | Phase 10 |

## Méthode

1. Clonage intégral du dépôt (historique compris).
2. Lecture complète : schéma Drizzle, 73 fichiers `route.ts`, composants,
   modules `src/lib`, scripts `.bat`, configurations, documentation embarquée.
3. Vérifications croisées : secrets, injections SQL, XSS, droits par endpoint,
   lockfile, migrations, tests, CI/CD, build réel du projet (`next build`).
4. Comparaison avec la documentation déjà commitée dans le dépôt
   (`AUDIT_COMPLET.md`, `docs/audit-kacemgroup/`, `docs/AUDIT-REPRISE.md`).
   Ces documents sont **exactement synchronisés avec le code** (commités dans
   le même commit que les dernières fonctionnalités) ; le présent dossier les
   **vérifie** et apporte deux corrections mineures :
   - le `package-lock.json` — présent dans d'anciens commits — est **absent
     à l'état actuel** (contrairement à ce qu'indique `AUDIT-REPRISE.md`) ;
   - les compteurs réels sont **32 tables / 73 routes** (et non 31/71).

## Position de l'audit

Conformément aux règles de reprise : ce dossier **documente et vérifie**,
il ne modifie rien. Toute évolution future suivra le protocole : analyse →
explication → impacts → risques → rollback → tests → autorisation.
