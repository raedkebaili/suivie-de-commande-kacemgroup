"use client";

import { useState } from "react";

/**
 * Manuel intégré « Configuration Google Drive », rédigé pour un débutant
 * complet : étapes numérotées, boutons Copier, liens officiels Google
 * uniquement, avertissements et dépannage.
 */
function Copy({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1800); }
        catch { /* presse-papiers indisponible */ }
      }}
      className="shrink-0 px-2 py-1 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700"
    >
      {done ? "✓ Copié" : "Copier"}
    </button>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="my-2">
      <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2">
        <code className="flex-1 text-[12px] break-all text-gray-800 dark:text-gray-100">{value}</code>
        <Copy value={value} />
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="border-l-4 border-blue-500 pl-4 py-1">
      <h3 className="font-bold text-gray-800 dark:text-white text-sm mb-2">
        <span className="inline-block w-6 h-6 rounded-full bg-blue-600 text-white text-[11px] leading-6 text-center mr-2">{n}</span>
        {title}
      </h3>
      <div className="text-[13px] text-gray-700 dark:text-gray-300 space-y-2 leading-relaxed">{children}</div>
    </section>
  );
}

const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline font-medium">{children}</a>
);

export default function GoogleDriveGuide({ redirectUri, onClose }: { redirectUri: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl mx-4">
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 rounded-t-2xl flex justify-between items-center z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">📘 Guide complet — Configuration Google Drive</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Rédigé pour un débutant : suivez les étapes dans l&apos;ordre, aucune connaissance technique requise.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500">✕</button>
        </div>

        <div className="px-6 py-5 space-y-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-[13px] text-blue-900 dark:text-blue-200">
            <b>1. Présentation.</b> La plateforme range vos PDF dans <b>un seul</b> compte Google Drive, choisi par vous.
            Tous les utilisateurs partagent cet espace, sans jamais voir vos identifiants Google. Comptez
            environ 10 minutes pour la configuration, à faire <b>une seule fois</b>.
          </div>

          <Step n={1} title="Choisir le compte Google de stockage">
            <p>Utilisez de préférence un <b>compte dédié à l&apos;entreprise</b>, par exemple <code>stockage@votre-entreprise.com</code>.</p>
            <p><b>Pourquoi ?</b> Les fichiers appartiennent à ce compte. Avec un compte personnel, si la personne quitte l&apos;entreprise ou change son mot de passe, le stockage peut devenir inaccessible. Un compte dédié reste maîtrisé par la société.</p>
            <p className="text-amber-700 dark:text-amber-400">⚠️ Restez connecté à ce compte dans votre navigateur pendant toute la configuration.</p>
          </Step>

          <Step n={2} title="Créer un projet Google Cloud">
            <p>Ouvrez <L href="https://console.cloud.google.com/">Google Cloud Console</L> et connectez-vous avec le compte de l&apos;étape 1.</p>
            <p>En haut de la page, cliquez sur le <b>sélecteur de projet</b> (à droite du logo), puis <b>« Nouveau projet »</b>.</p>
            <p>Nommez-le par exemple : <code>OrderTrack Google Drive Storage</code>, puis cliquez sur <b>Créer</b>. Attendez quelques secondes et vérifiez que le projet est bien sélectionné en haut.</p>
          </Step>

          <Step n={3} title="Activer Google Drive API">
            <p>Allez dans <L href="https://console.cloud.google.com/apis/library/drive.googleapis.com">APIs &amp; Services → Library → Google Drive API</L>.</p>
            <p>Cliquez sur le bouton bleu <b>« Enable »</b> (Activer). Sans cette étape, la connexion échouera.</p>
          </Step>

          <Step n={4} title="Configurer l'écran de consentement (Google Auth Platform)">
            <p>Ouvrez <L href="https://console.cloud.google.com/auth/overview">Google Auth Platform</L> puis renseignez :</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><b>Branding</b> : nom de l&apos;application (ex. <code>OrderTrack Pro</code>) et votre adresse e-mail d&apos;assistance.</li>
              <li><b>Audience</b> : choisissez <b>External</b> si vous utilisez un compte Google ordinaire (Gmail). Choisissez <b>Internal</b> uniquement si votre compte appartient à une organisation Google Workspace — dans ce cas aucune validation n&apos;est nécessaire.</li>
              <li><b>Data Access</b> : ajoutez le scope <code>.../auth/drive.file</code> (voir l&apos;encadré sécurité plus bas).</li>
              <li><b>Clients</b> : c&apos;est l&apos;étape 5 ci-dessous.</li>
            </ul>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <b>Mode « Testing » (cas le plus fréquent).</b> Avec un compte personnel, votre application reste en mode test.
              Vous devez alors ajouter votre compte de stockage dans <b>Audience → Test users</b>, sinon Google refusera la connexion.
              En mode test, l&apos;autorisation peut expirer après quelques jours : il suffira de cliquer sur « Reconnecter ».
              Pour un usage permanent, cliquez sur <b>« Publish app »</b> (aucune validation Google n&apos;est requise tant que vous
              utilisez seulement votre propre compte).
            </div>
          </Step>

          <Step n={5} title="Créer l'identifiant OAuth (Client ID)">
            <p>Allez dans <L href="https://console.cloud.google.com/auth/clients">Clients → Create client</L>.</p>
            <p><b>Application type</b> : choisissez <b>Web application</b>.</p>
            <p><b>Pourquoi « Web application » ?</b> Parce que la plateforme est un site web : Google doit pouvoir renvoyer le visiteur vers une adresse de retour (l&apos;URL de redirection ci-dessous). Les autres types (Desktop, Mobile) ne le permettent pas.</p>
          </Step>

          <Step n={6} title="Déclarer l'URL de redirection">
            <p>Toujours dans le même écran, section <b>« Authorized redirect URIs »</b>, cliquez sur <b>« + Add URI »</b> et collez <b>exactement</b> cette adresse générée par votre plateforme :</p>
            <Field label="URL de redirection à copier dans Google Cloud" value={redirectUri} />
            <p className="text-amber-700 dark:text-amber-400">⚠️ L&apos;adresse doit être identique au caractère près (pas de « / » final en trop). C&apos;est la cause d&apos;erreur n°1 (<code>redirect_uri_mismatch</code>).</p>
            <p>Si vous utilisez la plateforme en local <b>et</b> en production, ajoutez les deux adresses (locale et domaine public).</p>
            <p>Cliquez enfin sur <b>Create</b>.</p>
          </Step>

          <Step n={7} title="Récupérer le Client ID et le Client Secret">
            <p>Google affiche aussitôt une fenêtre contenant deux valeurs :</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><b>Client ID</b> : se termine par <code>.apps.googleusercontent.com</code></li>
              <li><b>Client Secret</b> : une suite de caractères commençant souvent par <code>GOCSPX-</code></li>
            </ul>
            <p>Copiez-les (ou téléchargez le JSON). Vous pouvez les retrouver plus tard en cliquant sur le nom du client dans la liste.</p>
          </Step>

          <Step n={8} title="Saisir les identifiants dans la plateforme">
            <p>Fermez ce guide, puis dans <b>Stockage → Configuration</b>, collez le <b>Client ID</b> et le <b>Client Secret</b>, et cliquez sur <b>Enregistrer</b>.</p>
            <p>Ces informations sont <b>chiffrées</b> et conservées sur le serveur. Elles ne sont jamais affichées ni envoyées au navigateur.</p>
          </Step>

          <Step n={9} title="Connecter Google Drive">
            <p>Cliquez sur <b>[ Connecter Google Drive ]</b>. Une fenêtre Google s&apos;ouvre : choisissez le compte de stockage et acceptez l&apos;autorisation.</p>
            <p>Si Google affiche <b>« Google n&apos;a pas validé cette application »</b> : cliquez sur <b>Paramètres avancés</b> puis <b>Accéder à … (non sécurisé)</b>. C&apos;est normal pour une application interne dont vous êtes le propriétaire.</p>
            <p>De retour sur la plateforme, vous devez voir : <b>🟢 Google Drive connecté</b> avec l&apos;adresse du compte.</p>
          </Step>

          <Step n={10} title="Le dossier de stockage">
            <p>À la première connexion, la plateforme recherche un dossier nommé <b>ORDERTRACK STORAGE</b> dans le Drive. S&apos;il existe, elle le réutilise ; sinon elle le crée automatiquement.</p>
            <p>Son identifiant est mémorisé : le dossier n&apos;est <b>jamais recréé en double</b>, même après une reconnexion.</p>
          </Step>

          <Step n={11} title="Tester la connexion">
            <p>Cliquez sur <b>[ Tester la connexion ]</b>. La plateforme vérifie réellement : accès au compte, accès au dossier, <b>lecture</b> et <b>écriture</b> (un fichier test est créé puis supprimé).</p>
            <p>Résultat attendu : <b>🟢 Connexion fonctionnelle</b>. En cas d&apos;erreur, le message indique précisément quoi corriger.</p>
          </Step>

          <Step n={12} title="Utiliser le stockage">
            <p>Vos utilisateurs peuvent maintenant déposer, consulter, télécharger et organiser des PDF depuis l&apos;onglet <b>Stockage</b>, selon leurs droits habituels. Ils n&apos;ont rien à configurer et ne voient jamais vos identifiants Google.</p>
          </Step>

          <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
            <h3 className="font-bold text-sm text-gray-800 dark:text-white mb-2">13. Dépannage</h3>
            <ul className="text-[13px] text-gray-700 dark:text-gray-300 space-y-1.5">
              <li><b>redirect_uri_mismatch</b> → l&apos;URL de l&apos;étape 6 ne correspond pas exactement à celle déclarée dans Google Cloud. Recopiez-la avec le bouton Copier.</li>
              <li><b>access_denied / app non validée</b> → ajoutez votre compte dans <b>Audience → Test users</b>, ou publiez l&apos;application (étape 4).</li>
              <li><b>Aucun refresh token / reconnexion demandée en boucle</b> → révoquez l&apos;accès dans <L href="https://myaccount.google.com/permissions">votre compte Google → Accès des applications</L>, puis reconnectez.</li>
              <li><b>Google Drive API has not been used…</b> → l&apos;API n&apos;est pas activée (étape 3).</li>
              <li><b>Autorisation expirée</b> → cliquez simplement sur <b>Reconnecter</b> ; les fichiers et le dossier sont conservés.</li>
              <li><b>Quota dépassé</b> → libérez de l&apos;espace dans le Drive du compte de stockage.</li>
            </ul>
          </div>

          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
            <h3 className="font-bold text-sm text-green-900 dark:text-green-300 mb-2">14. Sécurité</h3>
            <ul className="text-[13px] text-green-900 dark:text-green-200 space-y-1.5">
              <li>Le <b>Client Secret</b> et le <b>jeton de rafraîchissement</b> sont chiffrés (AES-256-GCM) et stockés uniquement sur le serveur.</li>
              <li>Ils ne sont <b>jamais</b> envoyés au navigateur, ni affichés, ni écrits dans les journaux.</li>
              <li>Le scope demandé est <code>drive.file</code>, le plus restrictif : la plateforme n&apos;accède <b>qu&apos;aux fichiers qu&apos;elle crée</b>, jamais au reste de votre Drive personnel.</li>
              <li>Les utilisateurs ne communiquent jamais directement avec Google : tout passe par le serveur, qui applique les droits de la plateforme.</li>
              <li>Les fichiers ne sont pas rendus publics : visualisation et téléchargement passent par une route authentifiée.</li>
            </ul>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
            <h3 className="font-bold text-sm text-gray-800 dark:text-white mb-2">15. Changer de compte Google</h3>
            <p className="text-[13px] text-gray-700 dark:text-gray-300">
              Cliquez sur <b>Déconnecter</b> puis reconnectez-vous avec le nouveau compte. <b>Aucun fichier n&apos;est supprimé</b> :
              les documents restent dans l&apos;ancien Drive. Le nouveau compte repartira d&apos;un dossier
              <b> ORDERTRACK STORAGE</b> vide — pensez à transférer vos fichiers si nécessaire.
            </p>
          </div>

          <div className="text-[12px] text-gray-500 dark:text-gray-400">
            <b>Documentation officielle Google :</b>{" "}
            <L href="https://console.cloud.google.com/">Cloud Console</L> ·{" "}
            <L href="https://developers.google.com/workspace/drive/api/guides/about-sdk">Google Drive API</L> ·{" "}
            <L href="https://developers.google.com/workspace/drive/api/guides/api-specific-auth">Authentification Drive</L> ·{" "}
            <L href="https://developers.google.com/identity/protocols/oauth2/scopes#drive">Scopes Drive</L> ·{" "}
            <L href="https://support.google.com/cloud/answer/15549257">Google Auth Platform</L>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-6 py-3 rounded-b-2xl flex justify-end">
          <button onClick={onClose} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">J&apos;ai terminé</button>
        </div>
      </div>
    </div>
  );
}
