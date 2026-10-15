"use client";

import { useState } from "react";
import Link from "next/link";
import { ROLE_LABELS, type User } from "@/lib/types";
import { Section, Row, btnGhost } from "@/components/mobile/ui";

/** Compte : identité, aide à l'installation, version ordinateur, déconnexion */
export default function MobileAccount({ user, onLogout }: { user: User; onLogout: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Compte</h1>

      <Section title="Profil">
        <Row label="Nom" value={user.fullName} />
        <Row label="Identifiant" value={user.username} />
        <Row label="Rôle" value={ROLE_LABELS[user.role] || user.role} />
      </Section>

      <Section title="Installer l'application">
        <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <p><b>Android (Chrome)</b> : menu ⋮ → « Installer l&apos;application » ou « Ajouter à l&apos;écran d&apos;accueil ».</p>
          <p><b>iPhone (Safari)</b> : bouton Partager ⬆︎ → « Sur l&apos;écran d&apos;accueil ». Ouvrez ensuite l&apos;icône depuis l&apos;écran d&apos;accueil.</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">L&apos;application nécessite une connexion internet.</p>
        </div>
      </Section>

      <Link href="/?bureau=1" className={`${btnGhost} flex items-center justify-center w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl`}>
        Ouvrir la version ordinateur
      </Link>

      <button
        onClick={async () => { setBusy(true); try { await onLogout(); } finally { setBusy(false); } }}
        disabled={busy}
        className="min-h-[48px] w-full rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold disabled:opacity-50"
      >
        {busy ? "Déconnexion…" : "Se déconnecter"}
      </button>
    </div>
  );
}
