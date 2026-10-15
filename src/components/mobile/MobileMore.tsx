"use client";

import Link from "next/link";
import { ChevronRight, Monitor, UserRound } from "lucide-react";
import { canOpenMobileSection, type MobileSection } from "@/lib/mobile-navigation";
import type { User } from "@/lib/types";
import { Section } from "@/components/mobile/ui";

/** Navigation secondaire mobile, filtrée selon les droits des modules existants. */
export default function MobileMore({ user, onOpen }: { user: User; onOpen: (section: MobileSection) => void }) {
  const rowClass = "flex min-h-[56px] w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium active:bg-slate-100 dark:active:bg-slate-700 focus-visible:outline-2 focus-visible:outline-blue-500";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Plus</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Votre compte et les raccourcis de l&apos;application.</p>
      </div>

      <Section title="Raccourcis">
        <button type="button" onClick={() => onOpen("account")} className={rowClass}>
          <UserRound className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" aria-hidden="true" />
          <span className="flex-1">Mon compte</span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
        {([
          { key: "notifications", label: "Notifications" },
          { key: "newOrder", label: "Nouvelle commande" },
          { key: "productionPlanning", label: "Planning production" },
          { key: "expeditionPlanning", label: "Planning d’expédition" },
          { key: "clients", label: "Clients" },
          { key: "agencies", label: "Agences" },
        ] as const).filter((item) => canOpenMobileSection(user.role, item.key)).map((item) => (
          <button key={item.key} type="button" onClick={() => onOpen(item.key)} className={rowClass}>
            <span className="flex-1">{item.label}</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ))}
        <Link href="/?bureau=1" className={rowClass}>
          <Monitor className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" aria-hidden="true" />
          <span className="flex-1">Version ordinateur</span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <p className="px-3 pt-1 text-xs text-slate-500 dark:text-slate-400">Retrouvez les autres modules selon vos droits dans la version ordinateur.</p>
      </Section>

      <Section title="Installer l'application">
        <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <p><b>Android (Chrome)</b> : menu ⋮ → « Installer l&apos;application » ou « Ajouter à l&apos;écran d&apos;accueil ».</p>
          <p><b>iPhone (Safari)</b> : bouton Partager → « Sur l&apos;écran d&apos;accueil ». Ouvrez ensuite l&apos;icône depuis l&apos;écran d&apos;accueil.</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">L&apos;application nécessite une connexion internet.</p>
        </div>
      </Section>
    </div>
  );
}
