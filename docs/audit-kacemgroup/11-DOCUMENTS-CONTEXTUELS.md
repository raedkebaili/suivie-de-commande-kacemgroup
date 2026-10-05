# Documentation — Gestion documentaire contextuelle (feature)

> Implémentation de la demande « Intégration des documents aux affaires, à la
> télégestion et aux études photométriques ». **Aucune modification du
> fonctionnement du module Stockage existant** : la feature s'y *branche*.

## 1. Principe

Le module **Stockage** (Google Drive centralisé, dossier « ORDERTRACK
STORAGE ») reste le moteur unique d'upload/téléchargement. La feature ajoute
une **couche d'association logique** fichier Drive ↔ entité métier, sans
jamais dupliquer physiquement un fichier (1 copie Drive, N contextes).

## 2. Réutilisation de l'existant (rien recréé)

| Brique existante | Utilisation par la feature |
|---|---|
| `getDriveClient()` (OAuth, refresh auto) | upload / lien / métadonnées |
| `ensureRootFolder()` | point d'ancrage des sous-dossiers contextuels |
| `bufferToStream()`, `friendlyDriveError()` | pipeline d'upload identique |
| `assertInsideRoot()` | sécurité du mode « lier un fichier existant » |
| `GET /api/storage/download/[id]` (`?token=`, `mode=inline`) | **téléchargement ET visualisation** — aucune nouvelle route de download |
| `GET /api/storage/files` | onglet « Depuis le Stockage » (anti-doublon) |
| Rôles existants | `WRITE_ROLES` alignés sur les routes métier courantes |

Fichiers physiques : `ORDERTRACK STORAGE / AFFAIRES / <n° commande>` et
`... / ETUDES PHOTOMETRIQUES / <n° étude>` → **visibles dans l'onglet Stockage**
(navigation par breadcrumb + recherche globale déjà existantes).

## 3. Ajouts (exhaustif)

| Fichier | Nature |
|---|---|
| `src/db/schema.ts` | + table `drive_documents` (FK `order_id`/`study_id` CASCADE, unicité logique, index, catégorie texte extensible, traçabilité) |
| `src/lib/document-categories.ts` | + constantes catégories/labels/formats (client+serveur, sans migration pour nouvelle catégorie) |
| `src/lib/google-drive.ts` | + `ensureContextFolder()` et helpers (**additif uniquement**) |
| `src/app/api/documents/route.ts` | + GET liste par entité ; POST multipart (upload) ou JSON `{mode:"link"}` |
| `src/app/api/documents/[id]/route.ts` | + DELETE (dissociation ; le fichier reste dans Stockage) |
| `src/components/DocumentsPanel.tsx` | + panneau réutilisable (liste, drag & drop, onglet Stockage, télécharger/visualiser/dissocier) + `PendingDocumentsZone` + `uploadPendingDocuments` |
| `GET /api/orders`, `GET /api/photometric-studies` | champs additifs `documentCount` (+`hasCahierDesCharges`), 1 requête groupée, rétrocompatible |
| `OrdersView.tsx` | badge 📄 animé (`.doc-blink`) dans le tableau ; section « Documents de l'affaire » dans le modal (création = mise en attente, édition = immédiat) ; badges 📎 sur études (sous commande + tableau indépendant) ; modal de consultation global |
| `TelegestionView.tsx` | section « Documents du projet » par commande (règle §9-11) |
| `globals.css` | animation `docPulse` discrète (+ `prefers-reduced-motion`) |

## 4. Cohérence des données (§19 de la demande)

Ordre strict : validation entité → opération Drive **confirmée** (id) →
insertion de l'association. Échec Drive ⇒ aucune ligne en base ; échec DB
après upload ⇒ suppression best-effort du fichier Drive (pas d'orphelin) ;
erreur explicite côté client, réessai possible.

## 5. Permissions (réutilisées)

- Lecture/liste : tout utilisateur authentifié (comme les lectures métier).
- Ajout affaire : `superadmin`, `commercial`, `technique` (le technique couvre
  l'ajout depuis Télégestion).
- Ajout étude : `superadmin`, `technique` (identique à `/api/photometric-studies`).
- Dissociation : `superadmin` ou l'auteur de l'association.
- Administration du stockage : inchangée (superadmin).

## 6. Tests exécutés (sandbox sans Drive configuré)

T1 ✅ commande sans doc → `documentCount: 0`, aucun badge. T2 ✅ upload échoué
(Drive non connecté) → 409 clair, **0 association créée**. T2c ✅ format refusé
(400). T3 ✅ lien inexistant → erreur claire. T6 ✅ étude créée, `documentCount: 0`,
upload étude → 409, 0 association. T9 ✅ planification/étude 403,
commercial/affaire 409 (=rôle accepté), technique/étude 409, lecture 200.
T11 ✅ régression : PUT commercial/technique + logs, télégestion, gardes
production/expédition, stockage inchangé, dashboard/users/activity, pages 200.
Validation finale : typegen ✅ tsc ✅ build ✅ healthcheck ✅.

*Le round-trip Drive réel (upload/download effectifs) s'appuie sur le module
Stockage existant et se vérifie dès que Google Drive est connecté (onglet
Stockage), sans changement supplémentaire.*

## 7. Rollback

Feature purement additive : désactivation = retirer les 2 routes
`/api/documents`, le composant et les 3 intégrations UI, puis
`DROP TABLE drive_documents` (aucune autre table ne la référence). Aucun
impact sur Stockage, commandes, télégestion ou études.
