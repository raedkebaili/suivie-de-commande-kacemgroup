"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import DashboardView from "@/components/DashboardView";
import OrdersView from "@/components/OrdersView";
import AgenciesView from "@/components/AgenciesView";
import ClientsView from "@/components/ClientsView";
import UsersView from "@/components/UsersView";
import WatchdogView from "@/components/WatchdogView";
import ProductionView from "@/components/ProductionView";
import ExpeditionView from "@/components/ExpeditionView";
import MatiereView from "@/components/MatiereView";
import BackupView from "@/components/BackupView";
import ColorsView from "@/components/ColorsView";
import RecouvrementView from "@/components/RecouvrementView";
import type { Notification } from "@/lib/types";
import { startBackupScheduler, stopBackupScheduler } from "@/lib/backup-scheduler";

function formatNotifDate(d: string) { if (!d) return ""; const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(d); if (m) return `${m[3]}/${m[2]} ${m[4]}:${m[5]}`; return d.substring(0,16); }

type Tab = "dashboard" | "orders" | "production" | "expedition" | "matieres" | "agencies" | "clients" | "users" | "watchdog" | "backup" | "colors" | "recouvrement";

// Hoisted outside the component: this list is static and doesn't need to be
// recreated on every render. Also reused by the Electron shortcut handler to
// check whether the current user's role is allowed to jump to a given tab.
const TABS: { key: Tab; label: string; roles: string[] }[] = [
  { key: "dashboard", label: "Tableau de bord", roles: ["superadmin", "commercial", "technique", "planification", "consultant_prod"] },
  { key: "orders", label: "Commandes", roles: ["superadmin", "commercial", "technique", "planification", "consultant_prod"] },
  { key: "production", label: "Production", roles: ["superadmin", "planification"] },
  { key: "expedition", label: "Expédition", roles: ["superadmin", "planification"] },
  { key: "matieres", label: "Matières", roles: ["superadmin", "technique"] },
  { key: "agencies", label: "Agences", roles: ["superadmin", "commercial"] },
  { key: "clients", label: "Clients", roles: ["superadmin", "commercial", "recouvrement"] },
  { key: "recouvrement", label: "Recouvrement", roles: ["superadmin", "recouvrement"] },
  { key: "users", label: "Utilisateurs", roles: ["superadmin"] },
  { key: "watchdog", label: "Watchdog", roles: ["superadmin"] },
  { key: "backup", label: "Sauvegarde", roles: ["superadmin"] },
  { key: "colors", label: "Couleurs", roles: ["superadmin"] },
];

export default function HomePage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const didRedirect = useRef(false);
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{orders: unknown[]; items: unknown[]; clients: unknown[]} | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Tracks a shortcut action (e.g. "new-order") that needs the target tab to
  // finish mounting before it can be dispatched to the child view.
  const pendingShortcutRef = useRef<string | null>(null);

  const availableTabs = useMemo(() => (user ? TABS.filter(t => t.roles.includes(user.role)) : []), [user]);

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch<{orders: unknown[]; items: unknown[]; clients: unknown[]}>(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(r);
        setShowSearch(true);
      } catch { setSearchResults(null); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiFetch<{ notifications: Notification[] }>(`/api/notifications?unread=1`);
      setNotifications(data.notifications);
    } catch { /* ok */ }
  }, []);

  useEffect(() => {
    if (!loading && !user && !didRedirect.current) { didRedirect.current = true; router.replace("/login"); }
  }, [loading, user, router]);

  useEffect(() => {
    if (user?.darkMode) setDarkMode(true);
  }, [user]);

  useEffect(() => {
    if (user) { fetchNotifications(); const iv = setInterval(fetchNotifications, 30000); return () => clearInterval(iv); }
  }, [user, fetchNotifications]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  // Démarrer le planificateur de sauvegarde automatique pour les superadmins
  useEffect(() => {
    if (user?.role === "superadmin") {
      startBackupScheduler();
      return () => stopBackupScheduler();
    }
  }, [user?.role]);

  // Once the "orders" tab has actually mounted, flush any pending shortcut
  // action (e.g. F2 pressed while on another tab) to OrdersView via a custom
  // DOM event — this decouples page.tsx from OrdersView's internals.
  useEffect(() => {
    if (activeTab === "orders" && pendingShortcutRef.current) {
      const action = pendingShortcutRef.current;
      pendingShortcutRef.current = null;
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(`shortcut:${action}`)));
    }
  }, [activeTab]);

  // ── Electron keyboard shortcuts (F2 = new order, F6 = dashboard, etc.) ──
  // window.electronAPI is only defined when running inside the Electron
  // desktop shell (see electron-app/preload.js); it's a no-op in the browser.
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onShortcut((action: string) => {
      if (!user) return;
      const allowedKeys = new Set(availableTabs.map(t => t.key));

      if ((TABS.some(t => t.key === action)) && allowedKeys.has(action as Tab)) {
        setActiveTab(action as Tab);
        return;
      }

      switch (action) {
        case "new-order":
          if (allowedKeys.has("orders")) {
            if (activeTab === "orders") {
              window.dispatchEvent(new CustomEvent("shortcut:new-order"));
            } else {
              pendingShortcutRef.current = "new-order";
              setActiveTab("orders");
            }
          }
          break;
        case "refresh":
          window.dispatchEvent(new CustomEvent("shortcut:refresh"));
          break;
        case "search":
          searchInputRef.current?.focus();
          break;
        case "notifications":
          setShowNotifs(v => !v);
          break;
        case "toggle-dark":
          setDarkMode(d => !d);
          break;
        case "logout":
          logout().then(() => router.push("/login"));
          break;
        default:
          break;
      }
    });
    return unsubscribe;
  }, [user, availableTabs, activeTab, logout, router]);

  const markRead = async (id: number) => {
    await apiFetch(`/api/notifications/${id}`, { method: "PUT", body: JSON.stringify({ read: true }) });
    fetchNotifications();
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950"><div className="flex flex-col items-center gap-3"><svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg><span className="text-sm text-gray-500 dark:text-gray-400">Chargement...</span></div></div>;
  if (!user) return null;

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className={`flex h-screen overflow-hidden ${darkMode ? "dark" : ""} bg-gray-50 dark:bg-gray-950`}>
      <Sidebar user={user} activeTab={activeTab} tabs={availableTabs} collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onTabChange={(tab) => { setActiveTab(tab as Tab); setMobileSidebarOpen(false); }}
        darkMode={darkMode} onToggleDarkMode={() => setDarkMode(!darkMode)} />

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 z-50">
            <Sidebar user={user} activeTab={activeTab} tabs={availableTabs} collapsed={false} onToggle={() => {}}
              onTabChange={(tab) => { setActiveTab(tab as Tab); setMobileSidebarOpen(false); }}
              darkMode={darkMode} onToggleDarkMode={() => setDarkMode(!darkMode)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 lg:px-6 py-3 flex items-center gap-3 shrink-0 shadow-sm">
          <button className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400" onClick={() => setMobileSidebarOpen(true)}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <button className="hidden lg:flex p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="flex-1 flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
              {TABS.find(t => t.key === activeTab)?.label || "Gestionnaire KACEM GROUP"}
            </h2>
            <span className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">KACEM GROUP</span>
            {/* Search bar */}
            <div className="hidden md:flex items-center gap-2 flex-1 max-w-md mx-4 relative">
              <input ref={searchInputRef} type="text" placeholder="🔍 Rechercher commande, client, affaire, article... (F3)"
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => searchResults && setShowSearch(true)}
                onBlur={() => setTimeout(() => setShowSearch(false), 200)}
                className="w-full px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-blue-500" />
              {showSearch && searchResults && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 max-h-80 overflow-y-auto">
                  {(searchResults as any).orders && (searchResults.orders as Record<string,unknown>[]).map((o: Record<string,unknown>) => (
                    <div key={o.id as number} className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 text-sm"
                      onMouseDown={() => { setActiveTab("orders"); setShowSearch(false); setSearchQuery(""); }}>
                      <span className="font-medium text-gray-800 dark:text-white">#{(o as Record<string,unknown>).order_number as string}</span>
                      <span className="text-gray-500 ml-2">{(o as Record<string,unknown>).client_name as string}</span>
                      {(o as any).affaire ? <span className="text-purple-500 ml-2 text-xs">{(o as any).affaire}</span> : null}
                    </div>
                  ))}
                  {(searchResults as any).items && (searchResults.items as Record<string,unknown>[]).map((it: Record<string,unknown>) => (
                    <div key={`it-${it.id}`} className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 text-sm"
                      onMouseDown={() => { setActiveTab("orders"); setShowSearch(false); setSearchQuery(""); }}>
                      <span className="text-gray-500">📦 {it.article_name as string}</span>
                      <span className="text-gray-400 ml-2">#{String(it.order_number||"")} - {String(it.client_name||"")}</span>
                    </div>
                  ))}
                  {(!(searchResults as any).orders?.length && !searchResults.items?.length) && (
                    <div className="px-3 py-2 text-gray-400 text-sm">Aucun résultat</div>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* Notifications bell */}
          <div className="relative">
            <button onClick={() => { setShowNotifs(!showNotifs); if (!showNotifs) fetchNotifications(); }}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 relative">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
              {unreadCount > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">{unreadCount}</span>}
            </button>
            {showNotifs && (
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 max-h-96 overflow-y-auto">
                <div className="p-3 border-b border-gray-200 dark:border-gray-700 font-semibold text-sm text-gray-800 dark:text-white">Notifications</div>
                {notifications.length === 0 ? <div className="p-4 text-sm text-gray-400 text-center">Aucune notification</div> :
                  notifications.slice(0, 20).map(n => (
                    <div key={n.id} className={`p-3 border-b border-gray-100 dark:border-gray-700/50 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 ${!n.read ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
                      onClick={() => markRead(n.id)}>
                      <div className="font-medium text-gray-800 dark:text-white text-xs">{n.title}</div>
                      <div className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{n.message}</div>
                      <div className="text-[10px] text-gray-400 mt-1">{formatNotifDate(n.createdAt)}</div>
                    </div>
                  ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-sm">{user.fullName.charAt(0)}</span>
            <span className="hidden sm:inline font-medium">{user.fullName}</span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-gray-50 dark:bg-gray-950">
          {activeTab === "dashboard" && <DashboardView user={user} />}
          {activeTab === "orders" && <OrdersView user={user} />}
          {activeTab === "production" && <ProductionView user={user} />}
          {activeTab === "expedition" && <ExpeditionView user={user} />}
          {activeTab === "matieres" && <MatiereView user={user} />}
          {activeTab === "agencies" && <AgenciesView user={user} />}
          {activeTab === "clients" && <ClientsView user={user} />}
          {activeTab === "recouvrement" && <RecouvrementView user={user} />}
          {activeTab === "users" && <UsersView user={user} />}
          {activeTab === "watchdog" && <WatchdogView user={user} />}
          {activeTab === "backup" && <BackupView user={user} />}
          {activeTab === "colors" && <ColorsView user={user} />}
        </main>
      </div>
    </div>
  );
}
