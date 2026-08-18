export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appColors } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { DEFAULT_COLORS, isValidHexColor, normalizeHexColor } from "@/lib/color-utils";

/**
 * Initialise les couleurs par défaut si la table est vide
 */
async function ensureDefaultColors() {
  const existing = await db.select().from(appColors).limit(1);
  if (existing.length === 0) {
    for (const color of DEFAULT_COLORS) {
      await db.insert(appColors).values({
        key: color.key,
        category: color.category,
        label: color.label,
        color: color.color,
        description: color.description,
        sortOrder: color.sortOrder,
      });
    }
  }
}

/**
 * GET /api/colors
 * Récupère toutes les couleurs configurées
 * Accessible à tous les utilisateurs authentifiés
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    await ensureDefaultColors();
    const colors = await db
      .select()
      .from(appColors)
      .orderBy(asc(appColors.sortOrder), asc(appColors.label));

    return NextResponse.json({ colors });
  } catch (error) {
    console.error("Erreur lors de la récupération des couleurs:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des couleurs" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/colors
 * Met à jour une couleur spécifique
 * Réservé aux superadmin
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
    const { key, color } = body;

    if (!key || !color) {
      return NextResponse.json(
        { error: "Clé et couleur requises" },
        { status: 400 }
      );
    }

    if (!isValidHexColor(color)) {
      return NextResponse.json(
        { error: "Code couleur HEX invalide. Format attendu: #RRGGBB" },
        { status: 400 }
      );
    }

    const normalizedColor = normalizeHexColor(color);

    // Vérifier que la couleur existe
    const [existing] = await db
      .select()
      .from(appColors)
      .where(eq(appColors.key, key))
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "Couleur non trouvée" },
        { status: 404 }
      );
    }

    // Enregistrer l'ancienne valeur pour le log
    const oldColor = existing.color;

    // Mettre à jour
    const [updated] = await db
      .update(appColors)
      .set({
        color: normalizedColor,
        updatedAt: new Date().toISOString(),
        updatedById: user.id,
        updatedByName: user.fullName,
      })
      .where(eq(appColors.key, key))
      .returning();

    await logActivity(
      user.id,
      user.username,
      "UPDATE_COLOR",
      `Couleur "${existing.label}": ${oldColor} → ${normalizedColor}`
    );

    return NextResponse.json({ color: updated });
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la couleur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de la couleur" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/colors
 * Restaure les couleurs par défaut
 * Réservé aux superadmin
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (user.role !== "superadmin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  try {
    const body = await request.json();
    
    // Restaurer une seule couleur ou toutes
    if (body.key) {
      // Restaurer une seule couleur
      const defaultColor = DEFAULT_COLORS.find(c => c.key === body.key);
      if (!defaultColor) {
        return NextResponse.json(
          { error: "Couleur par défaut non trouvée" },
          { status: 404 }
        );
      }

      const [updated] = await db
        .update(appColors)
        .set({
          color: defaultColor.color,
          updatedAt: new Date().toISOString(),
          updatedById: user.id,
          updatedByName: user.fullName,
        })
        .where(eq(appColors.key, body.key))
        .returning();

      await logActivity(
        user.id,
        user.username,
        "RESTORE_COLOR",
        `Couleur "${defaultColor.label}" restaurée à ${defaultColor.color}`
      );

      return NextResponse.json({ color: updated });
    } else {
      // Restaurer toutes les couleurs
      for (const defaultColor of DEFAULT_COLORS) {
        await db
          .update(appColors)
          .set({
            color: defaultColor.color,
            updatedAt: new Date().toISOString(),
            updatedById: user.id,
            updatedByName: user.fullName,
          })
          .where(eq(appColors.key, defaultColor.key));
      }

      await logActivity(
        user.id,
        user.username,
        "RESTORE_ALL_COLORS",
        "Toutes les couleurs restaurées aux valeurs par défaut"
      );

      const colors = await db
        .select()
        .from(appColors)
        .orderBy(asc(appColors.sortOrder), asc(appColors.label));

      return NextResponse.json({ colors, restored: true });
    }
  } catch (error) {
    console.error("Erreur lors de la restauration des couleurs:", error);
    return NextResponse.json(
      { error: "Erreur lors de la restauration des couleurs" },
      { status: 500 }
    );
  }
}
