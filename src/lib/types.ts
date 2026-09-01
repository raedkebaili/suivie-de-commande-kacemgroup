export type Role = "superadmin" | "commercial" | "technique" | "planification" | "consultant_prod" | "recouvrement";
export type Priority = "PREVISION" | "NORMALE" | "URGENTE" | "TRES_URGENTE";
export type OrderStatus = "SUR_STOCK" | "BON_COMMANDE" | "PREVISION" | "EN_INSTANCE" | "EN_PRODUCTION" | "LIVREE" | "ANNULEE";

export type User = { id: number; username: string; role: Role; fullName: string; active?: boolean; darkMode?: boolean; createdAt?: string };
export type Agency = { id: number; name: string; code: string; address?: string | null; active?: boolean; createdAt?: string };
export type Client = { id: number; name: string; code: string; contactName?: string | null; phone?: string | null; email?: string | null; address?: string | null; active?: boolean; createdAt?: string };
export type TechnicalComponent = { id: number; itemId: number; orderId: number; categoryId: number | null; materialId: number | null; categoryKey: string; categoryName: string; materialReference: string; materialLabel: string; isTelegestion: boolean; enteredById: number | null; enteredByName: string; enteredAt: string };
export type MaterialCategory = { id: number; key: string; name: string; isTelegestion: boolean; active: boolean; sortOrder: number };
export type Material = { id: number; categoryId: number | null; category: string; reference: string; name: string; stock: number; specs: string | null; active?: boolean };
export type OrderItem = { id?: number; orderId?: number; articleName: string; quantity: number; note?: string | null; clientSpec?: string | null; productionUnit?: string | null; plannedLoadingDate?: string | null; deliveredQty?: number; deliveryDate?: string | null; deliveredBy?: string | null; unitPrice?: string | null; description?: string | null; pcb?: string | null; pcbBy?: string | null; pcbAt?: string | null; colorTemperature?: string | null; colorTempBy?: string | null; colorTempAt?: string | null; lens?: string | null; lensBy?: string | null; lensAt?: string | null; driver?: string | null; driverBy?: string | null; driverAt?: string | null; electricalClass?: string | null; elecClassBy?: string | null; elecClassAt?: string | null; accessories?: string | null; accessoriesBy?: string | null; accessoriesAt?: string | null; otherTechSpecs?: string | null; otsBy?: string | null; otsAt?: string | null; producedQty?: number; productionStatus?: string; producedBy?: string | null; producedAt?: string | null; technicalComponents?: TechnicalComponent[] };
export type Order = {
  id: number; orderNumber: string; orderDate: string; priority: Priority; clientId: number; agencyId: number;
  status: OrderStatus; productionStatus?: string | null; statusReason?: string | null; affaire?: string | null;
  pcb?: string | null; pcbBy?: string | null; pcbAt?: string | null;
  colorTemperature?: string | null; colorTempBy?: string | null; colorTempAt?: string | null;
  lens?: string | null; lensBy?: string | null; lensAt?: string | null;
  driver?: string | null; driverBy?: string | null; driverAt?: string | null;
  electricalClass?: string | null; elecClassBy?: string | null; elecClassAt?: string | null;
  accessories?: string | null; accessoriesBy?: string | null; accessoriesAt?: string | null;
  profileCount?: number | null; profileCountBy?: string | null; profileCountAt?: string | null;
  otherTechSpecs?: string | null; otsBy?: string | null; otsAt?: string | null;
  productionUnit?: string | null;
  plannedLoadingDate?: string | null; quantityDelivered?: number | null;
  deliveryDate?: string | null; remainingToDeliver?: number | null;
  planifBy?: string | null; planifAt?: string | null;
  cancelReason?: string | null; cancelledBy?: string | null; cancelledAt?: string | null;
  createdBy?: number | null; createdByName?: string | null;
  updatedBy?: string | null;
  lockedBy?: number | null; lockedByName?: string | null; lockedAt?: string | null;
  techCompleted?: boolean; planifCompleted?: boolean;
  createdAt?: string; updatedAt?: string;
  clientName?: string; clientCode?: string; agencyName?: string; agencyCode?: string;
  items?: OrderItem[]; totalQuantity?: number;
};
export type Notification = { id: number; userId: number; type: string; title: string; message: string; orderId?: number | null; read: boolean; createdAt: string };
export type ProductionBatch = { id: number; itemId: number; orderId: number; quantity: number; cumulativeTotal: number; producedBy: string; productionDate: string; article_name?: string; createdAt: string };
export type ExpeditionBatch = { id: number; itemId: number; orderId: number; quantity: number; cumulativeTotal: number; driverName: string | null; plannedLoadingDate: string | null; deliveredBy: string; deliveryDate: string; note: string | null; article_name?: string; createdAt: string };

export type DashboardStats = {
  totalOrders: number; totalClients: number; totalAgencies: number;
  /** @deprecated kept for compatibility, mirrors productionStatusDistribution */
  statusDistribution: Record<string, number>;
  productionStatusDistribution: { EN_INSTANCE: number; EN_PRODUCTION: number; LIVREE: number; ANNULEE: number };
  commercialStatusDistribution: { SUR_STOCK: number; BON_COMMANDE: number; PREVISION: number };
  priorityDistribution: Record<string, number>;
  agencyOrders: { agencyName: string; count: number }[];
  monthlyOrders: { month: string; count: number }[];
  quantities: { totalOrdered: number; totalProduced: number; totalDelivered: number; totalRemaining: number };
};
export type ArticleLibrary = { id: number; name: string; description?: string | null; usageCount: number };
export type TechLibrary = { id: number; category: string; value: string; usageCount: number };

export const STATUS_LABELS: Record<string, string> = { SUR_STOCK: "Sur Stock", BON_COMMANDE: "Bon de Commande", PREVISION: "Prévision", EN_INSTANCE: "En instance", EN_PRODUCTION: "En production", LIVREE: "Livrée", ANNULEE: "Annulée" };
export const STATUS_COLORS: Record<string, string> = { SUR_STOCK: "bg-cyan-500", BON_COMMANDE: "bg-blue-500", PREVISION: "bg-orange-500", EN_INSTANCE: "bg-violet-500", EN_PRODUCTION: "bg-yellow-500", LIVREE: "bg-green-500", ANNULEE: "bg-[#FF2C2C]" };
export const STATUS_BG: Record<string, string> = { SUR_STOCK: "bg-cyan-100 dark:bg-cyan-900/30 border-cyan-300 dark:border-cyan-700", BON_COMMANDE: "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700", PREVISION: "bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700", EN_INSTANCE: "bg-violet-100 dark:bg-violet-900/30 border-violet-300 dark:border-violet-700", EN_PRODUCTION: "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700", LIVREE: "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700", ANNULEE: "bg-[#FF2C2C]/30 dark:bg-[#FF2C2C]/20 border-[#FF2C2C] dark:border-[#B81F1F]" };
export const PRIORITY_LABELS: Record<string, string> = { PREVISION: "Prévision", NORMALE: "Normale", URGENTE: "Urgente", TRES_URGENTE: "Très Urgente" };
export const ROLE_LABELS: Record<string, string> = { superadmin: "Super Admin", commercial: "Commercial", technique: "Technique", planification: "Planification", consultant_prod: "Consultant Prod", recouvrement: "Recouvrement" };

// ── Recouvrement ──
export type RecouvrementState = { id: number; key: string; label: string; description: string | null; colorKey: string; sortOrder: number; active: boolean };
export type ClientRecouvrementAssignment = { clientId: number; clientName: string; stateId: number; stateKey: string; label: string; colorKey: string; note: string | null; updatedByName: string | null; updatedAt: string | null };
