import { db, pool } from "@/db";
import { orderCounters } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getNextOrderSequenceNumber } from "@/lib/order-number-sequence";

/**
 * Génère le prochain numéro de commande de manière thread-safe
 * Format: N/AAAA (ex: 1/2026, 125/2026)
 * 
 * Utilise une transaction PostgreSQL avec FOR UPDATE pour garantir
 * l'unicité même en cas d'accès concurrent.
 */
export async function generateOrderNumber(): Promise<string> {
  const currentYear = new Date().getFullYear();

  // Utiliser une transaction avec verrouillage
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");

    // Verrouiller le compteur courant, puis le comparer au dernier numéro
    // réellement présent dans toute la plateforme. Cela couvre les anciennes
    // commandes d'une autre année et les imports manuels.
    const result = await client.query(
      `SELECT id, last_number FROM order_counters WHERE year = $1 FOR UPDATE`,
      [currentYear]
    );
    const maxOrderResult = await client.query(
      `SELECT COALESCE(MAX((regexp_match(order_number, '([0-9]+)'))[1]::integer), 0) AS max_number FROM orders`,
    );
    const platformLastNumber = Number(maxOrderResult.rows[0]?.max_number || 0);
    const counterLastNumber = Number(result.rows[0]?.last_number || 0);
    const nextNumber = getNextOrderSequenceNumber(platformLastNumber, counterLastNumber);

    if (result.rows.length === 0) {
      await client.query(
        `INSERT INTO order_counters (year, last_number, updated_at) VALUES ($1, $2, NOW())`,
        [currentYear, nextNumber]
      );
    } else {
      await client.query(
        `UPDATE order_counters SET last_number = $1, updated_at = NOW() WHERE year = $2`,
        [nextNumber, currentYear]
      );
    }

    await client.query("COMMIT");

    return `${nextNumber}/${currentYear}`;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Récupère le prochain numéro de commande sans l'incrémenter
 * Utilisé pour l'affichage dans le formulaire (preview)
 */
export async function getNextOrderNumberPreview(): Promise<string> {
  const currentYear = new Date().getFullYear();

  // Vérifier le compteur existant
  const [counter] = await db
    .select()
    .from(orderCounters)
    .where(eq(orderCounters.year, currentYear))
    .limit(1);

  const maxNumberResult = await db.execute(sql`
    SELECT COALESCE(MAX((regexp_match(order_number, '([0-9]+)'))[1]::integer), 0) AS max_number
    FROM orders
  `);
  const platformLastNumber = Number((maxNumberResult as unknown as { rows?: { max_number?: number | string }[] }).rows?.[0]?.max_number || 0);
  const counterLastNumber = counter?.lastNumber || 0;
  return `${getNextOrderSequenceNumber(platformLastNumber, counterLastNumber)}/${currentYear}`;
}

/**
 * Initialise les compteurs pour les années existantes
 * À appeler lors du premier démarrage ou de la migration
 */
export async function initializeOrderCounters(): Promise<void> {
  // Récupérer toutes les années distinctes des commandes existantes
  const result = await pool.query(`
    SELECT DISTINCT 
      CASE 
        WHEN order_number LIKE '%/%' THEN CAST(SPLIT_PART(order_number, '/', 2) AS INTEGER)
        WHEN order_number LIKE '%-%' THEN CAST(SPLIT_PART(order_number, '-', 2) AS INTEGER)
        ELSE EXTRACT(YEAR FROM created_at)::INTEGER
      END as year,
      MAX(
        CASE 
          WHEN order_number ~ '^[0-9]+[/-]' THEN CAST(SPLIT_PART(SPLIT_PART(order_number, '/', 1), '-', 1) AS INTEGER)
          ELSE 0
        END
      ) as max_number
    FROM orders
    GROUP BY 1
    HAVING CASE 
        WHEN order_number LIKE '%/%' THEN CAST(SPLIT_PART(order_number, '/', 2) AS INTEGER)
        WHEN order_number LIKE '%-%' THEN CAST(SPLIT_PART(order_number, '-', 2) AS INTEGER)
        ELSE EXTRACT(YEAR FROM created_at)::INTEGER
      END IS NOT NULL
  `);

  for (const row of result.rows) {
    if (row.year && row.year > 2000 && row.year < 2100) {
      // Vérifier si le compteur existe déjà
      const existing = await db
        .select()
        .from(orderCounters)
        .where(eq(orderCounters.year, row.year))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(orderCounters).values({
          year: row.year,
          lastNumber: row.max_number || 0,
        });
      }
    }
  }
}
