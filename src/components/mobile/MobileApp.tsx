"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import ForcePasswordChange from "@/components/ForcePasswordChange";
import OnlineUsersIndicator from "@/components/OnlineUsersIndicator";
import MobileHome from "@/components/mobile/MobileHome";
import MobileOrders from "@/components/mobile/MobileOrders";
import MobileOrderDetail from "@/components/mobile/MobileOrderDetail";
import MobileMore from "@/components/mobile/MobileMore";
import MobileAccount from "@/components/mobile/MobileAccount";

import { MobileDraftContext } from "@/lib/mobile-draft-context";
import MobileCommercial from "@/components/mobile/MobileCommercial";
import MobilePlanning from "@/components/mobile/MobilePlanning";
import MobileDirectory from "@/components/mobile/MobileDirectory";
import MobileNotifications from "@/components/mobile/MobileNotifications";
import { canOpenMobileSection, type MobileSection } from "@/lib/mobile-navigation";

type MobileTab = "home" | "orders" | "more" | MobileSection;

const TABS: { key: MobileTab; label: string; icon: string }[] = [
  { key: "home", label: "Accueil", icon: "🏠" },
  { key: "orders", label: "Commandes", icon: "📦" },
  { key: "more", label: "Plus", icon: "•••" },
];

const LOGIN_URL = "/login?next=%2Fmobile";

/**
 * Coquille de l'interface mobile : contrôle de session, en-tête, navigation du bas.
 * Les droits sont ceux du serveur ; l'interface ne fait qu'afficher ce qui est permis.
 */
export default function MobileApp() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [tab, setTab] = useState<MobileTab>("home");
  const [orderId, setOrderId] = useState<number | null>(null);
  const draft = useRef({ dirty: false, busy: false });
  const reportDraft = useCallback((dirty: boolean, busy: boolean) => { draft.current = { dirty, busy }; }, []);

  useEffect(() => {
    if (!loading && !user) router.replace(LOGIN_URL);
  }, [loading, user, router]);

  // Jeton expiré ou compte désactivé : déconnexion propre puis retour à la connexion
  const onSessionExpired = useCallback(async () => {
    await logout();
    router.replace(LOGIN_URL);
  }, [logout, router]);

  if (loading || !user) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-900 text-slate-200">
        <span className="text-sm">Chargement…</span>
      </div>
    );
  }

  if (user.mustChangePassword) return <ForcePasswordChange />;

  const openOrder = (id: number) => setOrderId(id);
  const closeOrder = () => setOrderId(null);
  const selectTab = (key: MobileTab) => {
    if (draft.current.busy) return;
    if (draft.current.dirty && !window.confirm("Quitter la saisie sans enregistrer ?")) return;
    setTab(key); setOrderId(null);
  };

  return (
    <MobileDraftContext.Provider value={reportDraft}>
    <div className={`${user.darkMode ? "dark" : ""} min-h-[100dvh] flex flex-col bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100`}>
      <header className="sticky top-0 z-20 bg-slate-900 text-white pt-[env(safe-area-inset-top)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 min-h-14">
          <div className="font-bold tracking-tight">Order Track Pro</div>
          {user.role === "superadmin" && <OnlineUsersIndicator />}
          <div className="text-xs text-slate-300 truncate max-w-[50%]">{user.fullName}</div>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-28 space-y-4 max-w-xl w-full mx-auto">
        {orderId !== null ? (
          <MobileOrderDetail key={orderId} orderId={orderId} user={user} onBack={closeOrder} onSessionExpired={onSessionExpired} />
        ) : tab === "home" ? (
          <MobileHome user={user} onSeeOrders={() => selectTab("orders")} onSessionExpired={onSessionExpired} />
        ) : tab === "orders" ? (
          <MobileOrders user={user} onCreate={() => selectTab("newOrder")} onOpen={openOrder} onSessionExpired={onSessionExpired} />
        ) : tab === "more" ? (
          <MobileMore user={user} onOpen={selectTab} />
        ) : (
          <>
            <button type="button" onClick={() => selectTab("more")} className="min-h-[44px] text-sm font-medium text-blue-700 dark:text-blue-300">← Retour à Plus</button>
            {!canOpenMobileSection(user.role, tab) ? (
              <p role="alert">Accès refusé.</p>
            ) : tab === "newOrder" ? (
              <MobileCommercial user={user} onSaved={(id) => { setTab("orders"); openOrder(id); }} onCancel={() => { setTab("more"); setOrderId(null); }} onSessionExpired={onSessionExpired} />
            ) : tab === "productionPlanning" || tab === "expeditionPlanning" ? (
              <MobilePlanning key={tab} kind={tab === "productionPlanning" ? "production" : "expedition"} user={user} onOpenOrder={openOrder} onSessionExpired={onSessionExpired} />
            ) : tab === "notifications" ? (
              <MobileNotifications onOpenOrder={openOrder} onSessionExpired={onSessionExpired} />
            ) : tab === "clients" || tab === "agencies" ? (
              <MobileDirectory key={tab} kind={tab} onSessionExpired={onSessionExpired} />
            ) : (
              <MobileAccount user={user} onLogout={onSessionExpired} />
            )}
          </>
        )}
      </main>

      <nav aria-label="Navigation principale" className="fixed bottom-0 inset-x-0 z-20 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-3 max-w-xl mx-auto">
          {TABS.map((t) => {
            const active = orderId === null && (tab === t.key || (t.key === "more" && tab !== "home" && tab !== "orders"));
            return (
              <button
                key={t.key}
                onClick={() => selectTab(t.key)}
                aria-current={active ? "page" : undefined}
                className={`min-h-[56px] flex flex-col items-center justify-center gap-0.5 text-xs font-medium ${active ? "text-blue-700 dark:text-blue-300" : "text-slate-500 dark:text-slate-400"}`}
              >
                <span className="text-xl leading-none" aria-hidden="true">{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
    </MobileDraftContext.Provider>
  );
}
