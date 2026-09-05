export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appColors } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { DEFAULT_COLORS, isValidHexColor, normalizeHexColor } from "@/lib/color-utils";
import { ensureArchiveColors } from "@/lib/archive";

/**
 * Initialise les couleurs par défaut manquantes.
 *
 * Seed IDEMPOTENT PAR CLÉ (et non plus « seulement si la table est vide ») :
 * d'autres sous-modules (recouvrement, archive) insèrent désormais leurs
 * propres clés dans app_colors. Avec l'ancien test « table vide », les
 * couleurs de base n'étaient plus créées dès qu'un sous-module avait déjà
 * écrit dans la table, et disparaissaient du gestionnaire.
 *
 * Les couleurs déjà présentes (donc éventuellement personnalisées par
 * l'administrateur) ne sont JAMAIS écrasées.
 */
async function ensureDefaultColors() {
  for (const color of DEFAULT_COLORS) {
    const [existing] = await db.select({ id: appColors.id }).from(appColors).where(eq(appColors.key, color.key)).limit(1);
    if (!existing) {
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
    // Sous-module Archive : ajoute ses propres clés (catégorie "archive")
    // sans toucher aux couleurs existantes du tableau de suivi.
    try { await ensureArchiveColors(); } catch (e) { console.error("Seed couleurs archive:", e); }
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
