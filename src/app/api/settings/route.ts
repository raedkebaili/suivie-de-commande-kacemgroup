import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Valeurs par défaut des paramètres
const DEFAULT_SETTINGS: Record<string, { value: string; description: string }> = {
  backup_enabled: { value: "true", description: "Activer la sauvegarde automatique quotidienne" },
  backup_time: { value: "22:00", description: "Heure de la sauvegarde automatique (HH:MM)" },
  backup_max_count: { value: "30", description: "Nombre maximum de sauvegardes à conserver" },
  backup_last_run: { value: "", description: "Date/heure de la dernière sauvegarde automatique" },
  backup_last_status: { value: "", description: "Statut de la dernière sauvegarde automatique" },
};

/**
 * Initialise les paramètres par défaut s'ils n'existent pas
 */
async function ensureDefaultSettings() {
  for (const [key, config] of Object.entries(DEFAULT_SETTINGS)) {
    const [existing] = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
    if (!existing) {
      await db.insert(systemSettings).values({
        key,
        value: config.value,
        description: config.description,
      });
    }
  }
}

/**
 * GET /api/settings
 * Récupère tous les paramètres système
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  
  // Seuls les superadmins peuvent voir les paramètres système
  if (user.role !== "superadmin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  try {
    await ensureDefaultSettings();
    const settings = await db.select().from(systemSettings);
    
    // Convertir en objet clé-valeur pour faciliter l'utilisation côté client
    const settingsMap: Record<string, string> = {};
    for (const setting of settings) {
      settingsMap[setting.key] = setting.value;
    }
    
    return NextResponse.json({ settings: settingsMap, raw: settings });
  } catch (error) {
    console.error("Erreur récupération paramètres:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * PUT /api/settings
 * Met à jour un ou plusieurs paramètres
 */
export async function PUT(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  
  if (user.role !== "superadmin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const updates: { key: string; value: string }[] = [];
    
    // Traiter les mises à jour
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        updates.push({ key, value: String(value) });
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "Aucun paramètre à mettre à jour" }, { status: 400 });
    }

    // Valider l'heure de sauvegarde si présente
    const timeUpdate = updates.find(u => u.key === "backup_time");
    if (timeUpdate) {
      const timeMatch = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/.exec(timeUpdate.value);
      if (!timeMatch) {
        return NextResponse.json({ error: "Format d'heure invalide. Utilisez HH:MM (ex: 22:00)" }, { status: 400 });
      }
      // Normaliser le format
      timeUpdate.value = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
    }

    // Valider le nombre max de sauvegardes
    const maxCountUpdate = updates.find(u => u.key === "backup_max_count");
    if (maxCountUpdate) {
      const count = parseInt(maxCountUpdate.value);
      if (isNaN(count) || count < 1 || count > 365) {
        return NextResponse.json({ error: "Le nombre de sauvegardes doit être entre 1 et 365" }, { status: 400 });
      }
      maxCountUpdate.value = String(count);
    }

    // Appliquer les mises à jour
    for (const update of updates) {
      const [existing] = await db.select().from(systemSettings).where(eq(systemSettings.key, update.key)).limit(1);
      
      if (existing) {
        await db.update(systemSettings)
          .set({
            value: update.value,
            updatedAt: new Date().toISOString(),
            updatedById: user.id,
            updatedByName: user.fullName,
          })
          .where(eq(systemSettings.key, update.key));
      } else {
        await db.insert(systemSettings).values({
          key: update.key,
          value: update.value,
          description: DEFAULT_SETTINGS[update.key]?.description || "",
          updatedById: user.id,
          updatedByName: user.fullName,
        });
      }
    }

    await logActivity(user.id, user.username, "UPDATE_SETTINGS", `Paramètres modifiés: ${updates.map(u => u.key).join(", ")}`);

    // Retourner les paramètres mis à jour
    const settings = await db.select().from(systemSettings);
    const settingsMap: Record<string, string> = {};
    for (const setting of settings) {
      settingsMap[setting.key] = setting.value;
    }

    return NextResponse.json({ ok: true, settings: settingsMap });
  } catch (error) {
    console.error("Erreur mise à jour paramètres:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
