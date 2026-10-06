import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export const NOTIFICATION_EVENTS = {
  ORDER_CREATED: "ORDER_CREATED",
  ORDER_READY: "ORDER_READY",
  ORDER_DELIVERED: "ORDER_DELIVERED",
  ORDER_CANCELLED: "ORDER_CANCELLED",
  PHOTOMETRIC_STUDY_ADDED: "PHOTOMETRIC_STUDY_ADDED",
  TECHNICAL_INTERVENTION: "TECHNICAL_INTERVENTION",
  PLANNING_CREATED: "PLANNING_CREATED",
  PLANNING_UPDATED: "PLANNING_UPDATED",
} as const;

export type NotificationEventKey = typeof NOTIFICATION_EVENTS[keyof typeof NOTIFICATION_EVENTS] | string;
export type NotificationSeverity = "info" | "success" | "warning" | "error";

export type NotificationPayload = {
  eventKey: NotificationEventKey;
  type?: NotificationSeverity;
  title: string;
  message: string;
  orderId?: number | null;
  targetTab?: string | null;
};

export async function createNotification(userId: number, payload: NotificationPayload) {
  return db.insert(notifications).values({
    userId,
    eventKey: payload.eventKey,
    type: payload.type || "info",
    severity: payload.type || "info",
    title: payload.title,
    message: payload.message,
    orderId: payload.orderId || null,
    targetTab: payload.targetTab || null,
    read: false,
  }).returning({ id: notifications.id });
}

export async function notifyUsers(userIds: number[], payload: NotificationPayload) {
  const ids = [...new Set(userIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return;
  await db.insert(notifications).values(ids.map((userId) => ({
    userId,
    eventKey: payload.eventKey,
    type: payload.type || "info",
    severity: payload.type || "info",
    title: payload.title,
    message: payload.message,
    orderId: payload.orderId || null,
    targetTab: payload.targetTab || null,
    read: false,
  })));
}

export async function notifyRoles(roles: string[], payload: NotificationPayload) {
  const normalizedRoles = [...new Set(roles)];
  if (normalizedRoles.length === 0) return;
  const recipients = await db.select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, normalizedRoles), eq(users.active, true)));
  await notifyUsers(recipients.map((user) => user.id), payload);
}

// Compatibilité avec les anciens appels pendant la transition des routes.
export async function notifyUser(userId: number, type: string, title: string, message: string, orderId?: number) {
  return createNotification(userId, {
    eventKey: `LEGACY_${type}`,
    type: (type === "success" || type === "warning" || type === "error" ? type : "info") as NotificationSeverity,
    title,
    message,
    orderId,
    targetTab: "orders",
  });
}

export async function notifyRole(role: string, type: string, title: string, message: string, orderId?: number) {
  return notifyRoles([role], {
    eventKey: `LEGACY_${type}`,
    type: (type === "success" || type === "warning" || type === "error" ? type : "info") as NotificationSeverity,
    title,
    message,
    orderId,
    targetTab: "orders",
  });
}
