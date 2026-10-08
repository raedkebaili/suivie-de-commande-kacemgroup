export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

const HIDEABLE_COLUMNS = ["date", "agence", "affaire", "priorite", "etatComm", "creePar", "modifiePar"] as const;
const HIDEABLE_PRODUCTION_STATES = ["EN_INSTANCE", "EN_PRODUCTION", "AWAITING_DELIVERY", "LIVREE", "ANNULEE"] as const;
const SORT_FIELDS = ["date", "alpha", "number"] as const;
const SORT_DIRECTIONS = ["asc", "desc"] as const;
const SETTING_PREFIX = "orders_preferences_user_";

type OrdersTablePreferences = {
  fs?: string;
  fa?: string;
  ff?: string;
  fp?: string;
  ftel?: boolean;
  fphoto?: boolean;
  searchTerm?: string;
  sortField?: (typeof SORT_FIELDS)[number];
  sortDir?: (typeof SORT_DIRECTIONS)[number];
  hiddenCols?: string[];
  hiddenProdStates?: string[];
  hideTotalRow?: boolean;
};

function settingKey(userId: number) {
  return `${SETTING_PREFIX}${userId}`;
}

function sanitizePreferences(input: unknown): OrdersTablePreferences {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const result: OrdersTablePreferences = {};
  if (typeof body.fs === "string" && body.fs.length <= 80) result.fs = body.fs;
  if (typeof body.fa === "string" && body.fa.length <= 40) result.fa = body.fa;
  if (typeof body.ff === "string" && body.ff.length <= 80) result.ff = body.ff;
  if (typeof body.fp === "string" && body.fp.length <= 40) result.fp = body.fp;
  if (typeof body.ftel === "boolean") result.ftel = body.ftel;
  if (typeof body.fphoto === "boolean") result.fphoto = body.fphoto;
  if (typeof body.searchTerm === "string" && body.searchTerm.length <= 160) result.searchTerm = body.searchTerm;
  if (typeof body.sortField === "string" && SORT_FIELDS.includes(body.sortField as (typeof SORT_FIELDS)[number])) result.sortField = body.sortField as OrdersTablePreferences["sortField"];
  if (typeof body.sortDir === "string" && SORT_DIRECTIONS.includes(body.sortDir as (typeof SORT_DIRECTIONS)[number])) result.sortDir = body.sortDir as OrdersTablePreferences["sortDir"];
  if (Array.isArray(body.hiddenCols)) result.hiddenCols = body.hiddenCols.filter((value): value is string => typeof value === "string" && HIDEABLE_COLUMNS.includes(value as (typeof HIDEABLE_COLUMNS)[number]));
  if (Array.isArray(body.hiddenProdStates)) result.hiddenProdStates = body.hiddenProdStates.filter((value): value is string => typeof value === "string" && HIDEABLE_PRODUCTION_STATES.includes(value as (typeof HIDEABLE_PRODUCTION_STATES)[number]));
  if (typeof body.hideTotalRow === "boolean") result.hideTotalRow = body.hideTotalRow;
  return result;
}

async function readPreferences(userId: number): Promise<OrdersTablePreferences | null> {
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, settingKey(userId))).limit(1);
  if (!row) return null;
  try {
    return sanitizePreferences(JSON.parse(row.value));
  } catch {
    return null;
  }
}

/** Préférences d'affichage privées du tableau des commandes, propres à chaque utilisateur. */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  try {
    return NextResponse.json({ preferences: await readPreferences(user.id) });
  } catch (error) {
    console.error("Erreur lecture préférences commandes:", error);
    return NextResponse.json({ error: "Erreur lors de la lecture des préférences" }, { status: 500 });
  }
}

/** Enregistre les préférences du tableau sans les partager avec les autres utilisateurs. */
export async function PUT(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  try {
    const preferences = sanitizePreferences(await request.json());
    const key = settingKey(user.id);
    const now = new Date().toISOString();
    const value = JSON.stringify(preferences);
    const [existing] = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
    if (existing) {
      await db.update(systemSettings).set({ value, updatedAt: now, updatedById: user.id, updatedByName: user.fullName }).where(eq(systemSettings.key, key));
    } else {
      await db.insert(systemSettings).values({ key, value, description: `Préférences personnelles du tableau des commandes (${user.username})`, updatedById: user.id, updatedByName: user.fullName });
    }
    return NextResponse.json({ preferences });
  } catch (error) {
    console.error("Erreur enregistrement préférences commandes:", error);
    return NextResponse.json({ error: "Erreur lors de l'enregistrement des préférences" }, { status: 500 });
  }
}
