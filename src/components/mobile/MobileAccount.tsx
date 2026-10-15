"use client";

import { useState } from "react";
import { ROLE_LABELS, type User } from "@/lib/types";
import { Section, Row } from "@/components/mobile/ui";

/** Compte : identité et déconnexion. Les raccourcis sont dans le menu Plus. */
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
