# 05 — Rapport de sécurité (Phase 6)

## Synthèse

Application **déployée en réseau local** (LAN d'entreprise) — la surface est
réduite par le contexte, mais plusieurs points doivent être corrigés avant
toute exposition plus large. Architecture d'authentification simple et
cohérente ; chiffrement des secrets Drive bien implémenté ; **pas
d'injection SQL** constatée ; **pas de XSS** constatée.

| Niveau | Décompte | Exemples |
|---|---|---|
| Critique | 2 | secret JWT de secours codé en dur ; identifiants admin affichés |
| Élevé | 4 | JWT en localStorage, non révocable 24 h ; absence de rate limiting ; IDOR notifications ; sauvegarde contenant les hash |
| Moyen | 6 | endpoint public, rôle figé dans le jeton, en-têtes de sécurité absents, … |

## Points forts vérifiés

- Mots de passe hachés **bcrypt** (coût 10), jamais renvoyés par les API
  (`/api/users` sélectionne les colonnes).
- Secrets Google **AES-256-GCM** (`crypto.ts`), clé dédiée
  `APP_ENCRYPTION_KEY`, jamais journalisés ni renvoyés (masquage
  `1234…cdef` côté admin).
- Scope OAuth minimal **`drive.file`** : l'app n'accède qu'aux fichiers
  qu'elle a créés ; flux `state` anti-forge au callback.
- Contrôle de rôle **systématique côté serveur** sur chaque handler
  (jamais côté UI seul) — vérifié route par route.
- **Aucune injection SQL** : requêtes paramétrées Drizzle ; les 2
  `sql.raw` portent sur des identifiants **codés en dur** (reset DB,
  `setval` sur liste fixe) — sûrs.
- **Aucun `dangerouslySetInnerHTML`, `eval`, `new Function`** ; React
  échappe le rendu ; le HTML du callback OAuth est statique.
- Uploads : **PDF + extension + 50 Mo** (Stockage) ; liste d'extensions +
  50 Mo (Documents) ; archive Excel 25 Mo — vérifiés côté serveur.
- RAZ base protégée : superadmin + confirmation `REINITIALISER` + **mot de
  passe admin re-vérifié**.
- `poweredByHeader: false` ; `.env` git-ignoré ; aucun secret commité
  (vérifié par recherche sur tout l'historique lisible).
- Jeton en **en-tête Bearer** (pas de cookie) ⇒ **pas de surface CSRF**.

## Vulnérabilités constatées

### CRITIQUE
1. **Secret JWT de secours codé en dur** — `src/lib/auth.ts` :
   `process.env.JWT_SECRET || "otp-super-secret-jwt-key-2024"`. Sans
   variable d'environnement, tout jeton est forgeable par quiconque lit le
   code (dépôt public). *Le setup Windows génère bien un secret aléatoire,
   mais le fallback demeure.* → exiger la variable, supprimer le fallback.
2. **Identifiants par défaut `admin / mot de passe initial configuré hors dépôt`** semés
   automatiquement **et affichés sur la page de connexion**
   (`login/page.tsx`). Aucun changement de mot de passe n'est forcé à la
   première connexion. → retirer l'affichage, forcer la rotation.

### ÉLEVÉ
3. **Session JWT en `localStorage`** (`otp_token`) : lisible par tout JS
   exécuté sur la page (vol par XSS) ; pas de rotation ; **expiration
   24 h sans révocation** — la déconnexion et le changement de
   rôle/état `active=false` n'invalident pas les jetons déjà émis
   (le jeton n'est jamais re-validé en base).
4. **Aucun rate limiting** sur `POST /api/auth/login` (force brute
   possible) — critique si l'app quitte le LAN.
5. **IDOR** `PUT /api/notifications/[id]` : le handler ne vérifie pas que
   la notification appartient à l'appelant (n'importe quel utilisateur peut
   marquer lues celles d'autrui).
6. **`GET /api/backup` contient `users.password_hash` et la configuration
   chiffrée**, téléchargé en JSON clair et stocké tel quel dans
   `backup_history.backup_data` (copie intégrale de la base dans la base —
   à protéger en restauration et en stockage).

### MOYEN
7. `GET /api/library/production-units` : **aucune authentification**
   (divulgation mineure — unique endpoint public hors auth/health
   constaté).
8. **En-têtes de sécurité absents** : aucun `headers()` dans
   `next.config.ts` (pas de CSP, `X-Content-Type-Options`, `X-Frame-Options`,
   HSTS si TLS).
9. **Rôle figé dans le JWT 24 h** : une rétrogradation ne prend effet
   qu'à la prochaine connexion (ou expiration).
10. **Pas de politique de mot de passe** (longueur, complexité) ni de 2FA ;
    bcrypt coût 10 (acceptable, 12 recommandé).
11. OAuth : le `state` est stocké dans le champ `lastError` de
    `storage_config` ( mono-emploi : un second admin lançant un flux
    invalide le premier) et le `postMessage` de confirmation utilise
    `"*"`.
12. Dépendances : **lockfile absent** (versions flottantes, `npm audit`
    non reproductible) ; `xlsx` 0.18.5 (historiquement sujet à des CVE —
    usage côté serveur à surveiller), `@types/*` en `dependencies`,
    `dotenv` en doublon de la gestion native Next.

## Recommandations priorisées (non appliquées — en attente d'autorisation)

1. Supprimer les 2 critiques (hardcode + admin par défaut).
2. Ajouter un middleware d'en-têtes de sécurité et un rate limiter de
   login (même simple, en mémoire).
3. Re-valider `users.active` et le rôle en base sur les routes sensibles.
4. Corriger l'IDOR notifications (`where id = ? AND user_id = ?`) et
   authentifier `library/production-units`.
5. Exclure `password_hash` des sauvegardes ou chiffrer le fichier exporté.
6. Rétablir un lockfile + pipeline `npm audit`.
