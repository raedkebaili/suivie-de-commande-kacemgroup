# Phase 10 — Risques, dette technique et opportunités

## 10.1 Registre des risques (probabilité × impact)

| # | Risque | Prob. | Impact | Mitigation proposée (avec accord) |
|---|---|---|---|---|
| R1 | Secret JWT de repli utilisé en production (SEC-1) | moyenne | **critique** | échec explicite au démarrage si `JWT_SECRET` absent (comportement sinon inchangé) |
| R2 | Compte `admin/admin123` résiduel, identifiants affichés (SEC-2) | moyenne | **critique** | retirer l'affichage du login ; imposer le changement à la 1ʳᵉ connexion |
| R3 | Dérive des dépendances (pas de lockfile) | haute | moyen | commiter `package-lock.json` et épingler |
| R4 | Non-régression non testable (0 test) | haute | élevé | socle minimal de tests sur numérotation, idempotence planning, promotion priorités |
| R5 | Vulnérabilités `xlsx` (SEC-5) | moyenne | élevé | migrer vers la distribution SheetJS officielle (`https://cdn.sheetjs.com`) ou `exceljs` pour l'export |
| R6 | Croissance `GET /api/orders` (P-1/P-3) | certaine | moyen | map + index (sans changer la réponse) |
| R7 | `backup_history.backup_data` grossit la DB | moyenne | moyen | rotation externe / compression |
| R8 | Évolution de schéma sans migrations versionnées | moyenne | élevé | adopter `drizzle-kit generate` (SQL versionné) sur les changements futurs |
| R9 | Sauvegarde auto dépendant d'un navigateur ouvert | moyenne | élevé | cron externe documenté (`BACKUP_SECRET`) ou tâche planifiée Windows |
| R10 | Session non révocable 24 h (SEC-6) | faible | moyen | relecture DB au /me ou version de token (évolution, à valider) |

## 10.2 Dette technique consolidée

1. **Tests** : absents — priorité d'investissement n°1.
2. **Reproductibilité** : lockfile manquant ; nom de package non renommé.
3. **Duplication auth** : helper local ×20 vs `api-helpers.ts` inutilisé.
4. **Monolithes UI** : OrdersView (992 l.) et 5 autres vues > 500 l. ; `page.tsx` charge tout.
5. **Schéma** : push direct sans SQL versionné ; statuts/rôles en texte sans CHECK ; index secondaires absents.
6. **Cohérences faibles** : 2 configs Drizzle ; doublon `.json` avec credentials locaux ;
   variables `APP_ENCRYPTION_KEY`/`BACKUP_SECRET` non documentées dans `.env.example`.
7. **Transactions** : création de commande (commande + items + notifications) non atomique.
8. **Observabilité** : logs `console` seuls ; aucune instrumentation.

## 10.3 Opportunités d'amélioration (progressives, sans casse)

Ordre conseillé — chaque lot est indépendant et réversible :

1. **Hygiène immédiate (1 j)** : retirer `admin/admin123` de la page login ;
   documenter `APP_ENCRYPTION_KEY`/`BACKUP_SECRET` dans `.env.example` ;
   supprimer `drizzle.config.json` (ou l'aligner) ; commiter le lockfile ;
   protéger `/api/orders/next-number`.
2. **Sécurité (2–3 j)** : fail-fast sur `JWT_SECRET` manquant ; rate-limit
   login ; en-têtes de sécurité (`next.config.ts`) ; forcer le changement du
   mot de passe initial ; remplacer `xlsx` (ou le passer à la distribution
   officielle SheetJS).
3. **Fiabilité (2–3 j)** : transactions sur création de commande ;
   utiliser `api-helpers.checkAuth` dans toutes les routes (comportement
   identique, code dédupliqué) ; tests minimaux des règles critiques.
4. **Performance (1–2 j)** : index FK ; groupage Map dans `/api/orders` ;
   `next/dynamic` pour les 17 onglets.
5. **Maintenabilité (continu)** : découper OrdersView ; migrations versionnées
   ; énumérations TS partagées des statuts/rôles (sans migration DB, typage
   seul au départ).

## 10.4 Questions ouvertes (aucune hypothèse retenue)

1. **Electron** : où vit le dossier `electron-app/` (preload/main) ? Est-il une
   cible de déploiement active ?
2. **Cible de production réelle** aujourd'hui : poste Windows LAN, Vercel+Neon,
   ou les deux ? (les deux stratégies cohabitent dans la doc)
3. `JWT_SECRET`, `APP_ENCRYPTION_KEY`, `BACKUP_SECRET` sont-elles **définies**
   sur l'environnement de production actuel ?
4. Le mot de passe `admin` a-t-il été changé en production ?
5. Volumes réels (commandes/an, items/commande max) — pour calibrer la
   priorité des optimisations P-1/P-3.
6. `AUDIT_COMPLET.md` / `docs/AUDIT-REPRISE.md` : faut-il que ce présent
   dossier les remplace dans le dépôt, ou cohabiter ?
7. Existe-t-il un Excel « master » d'archive représentatif pour valider un
   futur test de non-régression de l'import ?
8. Souhait de conserver `lucide-react@1.38.0` (figé) ou mise à jour autorisée ?

## 10.5 Engagement de méthode pour la suite

Conformément à la charte établie : toute évolution future commencera par
(1) l'explication du fonctionnement actuel, (2) la liste exacte des fichiers
touchés, (3) l'analyse d'impact et du risque de régression, (4) la stratégie de
rollback, (5) la stratégie de tests — et **n'attendra pas moins qu'une
autorisation explicite** avant toute modification.
