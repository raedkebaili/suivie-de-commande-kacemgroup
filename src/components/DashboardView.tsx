"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useColors } from "@/lib/color-context";
import type { DashboardStats, User } from "@/lib/types";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";

// Labels pour les statuts (les couleurs viennent maintenant du ColorContext)
const PROD_LABELS: Record<string, string> = { EN_INSTANCE: "En instance", EN_PRODUCTION: "En production", LIVREE: "Livrée", ANNULEE: "Annulée" };
const COMM_LABELS: Record<string, string> = { SUR_STOCK: "Sur Stock", BON_COMMANDE: "Bon de Commande", PREVISION: "Prévision" };

export default function DashboardView({ user: _ }: { user: User }) {
  const { getColor } = useColors();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<DashboardStats>("/api/dashboard")
      .then(setStats)
      .catch(err => setError(err instanceof Error ? err.message : "Erreur de chargement"))
      .finally(() => setLoading(false));
  }, []);
  
  // Utiliser les couleurs dynamiques du context
  const PROD_COLORS: Record<string, string> = {
    EN_INSTANCE: getColor("EN_INSTANCE"),
    EN_PRODUCTION: getColor("EN_PRODUCTION"),
    LIVREE: getColor("LIVREE"),
    ANNULEE: getColor("ANNULEE"),
  };
  
  const COMM_COLORS: Record<string, string> = {
    SUR_STOCK: getColor("SUR_STOCK"),
    BON_COMMANDE: getColor("BON_COMMANDE"),
    PREVISION: getColor("PREVISION"),
  };

  if (loading) return <div className="flex items-center justify-center h-64"><svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>;
  if (error) return <div className="text-center text-red-500 py-12">{error}</div>;
  if (!stats) return <div className="text-center text-gray-500 py-12">Aucune donnée</div>;

  const prodPie = Object.entries(stats.productionStatusDistribution || {}).map(([k, v]) => ({ name: PROD_LABELS[k] || k, value: v, color: PROD_COLORS[k] || "#6b7280" }));
  const commBars = Object.entries(stats.commercialStatusDistribution || {}).map(([k, v]) => ({ name: COMM_LABELS[k] || k, count: v, color: COMM_COLORS[k] || "#6b7280" }));
  const prio = Object.entries(stats.priorityDistribution || {}).map(([k, v]) => ({ name: k.replace("_", " "), count: v }));
  const qty = stats.quantities || { totalOrdered: 0, totalProduced: 0, totalDelivered: 0, totalRemaining: 0 };

  return <div className="space-y-6">
    {/* KPIs — global counters */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <Kpi label="Total Commandes" value={stats.totalOrders} icon="📋" color="from-blue-500 to-blue-600" />
      <Kpi label="Clients" value={stats.totalClients} icon="👥" color="from-emerald-500 to-emerald-600" />
      <Kpi label="Agences" value={stats.totalAgencies} icon="🏢" color="from-purple-500 to-purple-600" />
      <Kpi label="En Instance" value={stats.productionStatusDistribution?.EN_INSTANCE || 0} icon="🟣" color="from-violet-500 to-violet-600" />
      <Kpi label="En Production" value={stats.productionStatusDistribution?.EN_PRODUCTION || 0} icon="⚙️" color="from-yellow-500 to-yellow-600" />
      <Kpi label="Livrées" value={stats.productionStatusDistribution?.LIVREE || 0} icon="✅" color="from-green-500 to-green-600" />
    </div>

    {/* Quantities summary */}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <QtyCard label="Qté Commandée" value={qty.totalOrdered} icon="📦" color="text-blue-600 dark:text-blue-400" />
      <QtyCard label="Qté Produite" value={qty.totalProduced} icon="🏭" color="text-yellow-600 dark:text-yellow-400" />
      <QtyCard label="Qté Livrée" value={qty.totalDelivered} icon="🚚" color="text-green-600 dark:text-green-400" />
      <QtyCard label="Restant à Livrer" value={qty.totalRemaining} icon="⏳" color="text-red-600 dark:text-red-400" />
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card title="Répartition par État de Production">
        {prodPie.every(e => e.value === 0) ? <EmptyChart /> : (
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="60%" height={220}><PieChart><Pie data={prodPie} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value">{prodPie.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
            <div className="space-y-2 text-sm">{prodPie.map(e => <div key={e.name} className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: e.color }} /><span className="text-gray-600 dark:text-gray-400">{e.name}</span><span className="font-bold text-gray-800 dark:text-white">{e.value}</span></div>)}</div>
          </div>
        )}
      </Card>
      <Card title="États Commerciaux (à la création)">
        {commBars.every(e => e.count === 0) ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={commBars}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Commandes" radius={[6, 6, 0, 0]}>{commBars.map((e, i) => <Cell key={i} fill={e.color} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card title="Commandes par Agence">
        {(!stats.agencyOrders || stats.agencyOrders.length === 0) ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height={250}><BarChart data={stats.agencyOrders}><CartesianGrid strokeDasharray="3 3" stroke="#374151" /><XAxis dataKey="agencyName" tick={{ fontSize: 12 }} stroke="#9ca3af" /><YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" allowDecimals={false} /><Tooltip /><Bar dataKey="count" name="Commandes" fill="#3b82f6" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
        )}
      </Card>
      <Card title="Évolution Mensuelle">
        {(!stats.monthlyOrders || stats.monthlyOrders.length === 0) ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height={250}><LineChart data={stats.monthlyOrders}><CartesianGrid strokeDasharray="3 3" stroke="#374151" /><XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9ca3af" /><YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="count" name="Cmd" stroke="#8b5cf6" strokeWidth={3} dot={{ fill: "#8b5cf6", r: 4 }} /></LineChart></ResponsiveContainer>
        )}
      </Card>
    </div>

    <div className="grid grid-cols-1 gap-6">
      <Card title="Répartition par Priorité">
        {prio.every(e => e.count === 0) ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height={220}><BarChart data={prio} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#374151" /><XAxis type="number" tick={{ fontSize: 12 }} stroke="#9ca3af" allowDecimals={false} /><YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} stroke="#9ca3af" width={100} /><Tooltip /><Bar dataKey="count" name="Cmd" fill="#f59e0b" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer>
        )}
      </Card>
    </div>
  </div>;
}

function EmptyChart() {
  return <div className="flex items-center justify-center h-[220px] text-sm text-gray-400 dark:text-gray-500">Aucune donnée pour le moment</div>;
}

function Kpi({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between"><div><div className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</div><div className="text-2xl font-bold text-gray-800 dark:text-white mt-1">{value}</div></div><div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-lg shadow-lg shrink-0`}>{icon}</div></div></div>;
}
function QtyCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 flex items-center gap-3">
    <span className="text-2xl">{icon}</span>
    <div><div className="text-xs text-gray-500 dark:text-gray-400">{label}</div><div className={`text-xl font-bold ${color}`}>{value}</div></div>
  </div>;
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-800"><h3 className="text-base font-semibold text-gray-800 dark:text-white mb-4">{title}</h3>{children}</div>;
}
