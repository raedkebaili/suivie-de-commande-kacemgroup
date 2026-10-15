# 10 — Risques & opportunités (Phase 10)

## Analyse des risques

| # | Risque | Impact | Probabilité | Niveau |
|---|---|---|---|---|
| R1 | Secret JWT de secours + admin / mot de passe initial configuré hors dépôt exposés | compromission totale | élevée si non corrigé | **Critique** |
| R2 | **Lockfile absent** → installation non reproductible, régression silencieuse possible à chaque `npm install` | panne en prod | moyenne | Élevé |
| R3 | Sauvegarde automatique dépend d'un **navigateur ouvert** | absence silencieuse de sauvegardes | moyenne | Élevé |
| R4 | Poste Windows unique (appli + base) — pas de cluster ni de réplication | interruption de service | moyenne | Élevé |
| R5 | Compte Google unique pour tout le stockage | indisponibilité documentaire | faible/moyenne | Moyen |
| R6 | Aucun test automatisé ; modifications à l'aveugle | régressions | croissante avec la taille | Élevé |
| R7 | Pas de migrations versionnées (`push` direct) | dérive schéma non tracée | moyenne | Moyen |
| R8 | Fichiers de sauvegarde (hash, config) en clair | fuite interne | faible | Moyen |
| R9 | Croissance de `backup_history.backup_data` (copies intégrales en base) | gonflement de la base | lente | Moyen |
| R10 | Absence de pagination `GET /api/orders` à forte volumétrie | latence de l'onglet principal | lente | Moyen |
| R11 | Dépendance `xlsx` (suivi CVE) côté serveur | vulnérabilité tierce | faible | Moyen |
| R12 | Documentation Electron **hors dépôt** | maintenance du shell opaque | — | Faible |

## Dette technique consolidée

Critiques de fond : **tests absents**, **lockfile absent**, auth dupliquée,
pas de migrations, secrets de secours. Le reste (formatage, code mort,
composants volumineux) est cosmétique et facilement traitable par petites
touches, sans toucher à la logique métier.

## Opportunités d'amélioration (progressives, compatibilité préservée)

### P0 — Sécurité immédiate (faible risque de régression)
1. Supprimer le fallback JWT + exiger `JWT_SECRET` au démarrage.
2. Retirer l'affichage des identifiants sur `/login` ; forcer le changement
   de mot de passe à la première connexion.
3. IDOR notifications ; authentifier `library/production-units`.
4. En-têtes de sécurité dans `next.config.ts` (`headers()`).
5. Rate limiting sur `/api/auth/login`.
6. **Rétablir un lockfile** (commit `package-lock.json` + `npm ci`).

### P1 — Robustesse exploitation
7. Sauvegarde **côté serveur** (cron Node/`node-cron` ou tâche planifiée
   Windows) en complément du planificateur navigateur.
8. Index sur les FK massives (DDL additive — voir 06).
9. Exclure `password_hash` des exports de sauvegarde.
10. Migrations Drizzle versionnées (`drizzle-kit generate`) en parallèle du
    `push` (les deux cohabitent).
11. OAuth : déplacer le `state` dans une table/clé dédiée.

### P2 — Performance & DX
12. `next/dynamic` par onglet (boot plus rapide, comportement identique).
13. Pagination serveur des commandes (évolution du contrat — à cadrer).
14. Factoriser `checkAuth` (supprimer les ~40 helpers locaux) **après**
    ajout de tests de non-régression d'API.
15. Socle de tests : Vitest sur les libs pures (numérotation, priorités,
    états visuels, archive) + tests d'API sur les flux critiques
    (création commande, production, planning idempotent).
16. CI minimale (GitHub Actions : typecheck + lint + build + audit).

## Questions ouvertes — À TRANCHER AVEC VOUS AVANT TOUTE MODIFICATION

1. **Version de Node cible** officielle ? (rien n'est épinglé)
2. Le shell **Electron** vit-il dans un autre dépôt ? Faut-il l'auditer ?
3. L'application doit-elle rester **strictement LAN**, ou une exposition
   internet est-elle prévue ? (conditionne P0-4/P0-5)
4. Faut-il **commiter un lockfile** maintenant (regénéré) ? Quel gestionnaire
   : npm confirmé ?
5. Les sauvegardes doivent-elles **chiffrer** leur contenu ?
6. Des contraintes de **conservation légale** pour les archives Excel et
   les journaux ?
7. Souhaitez-vous que la première intervention soit le lot **P0 sécurité**
   (proposition ci-dessus), ou un autre axe ?
