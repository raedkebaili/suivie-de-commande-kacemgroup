import { db, pool } from "@/db";
import { orderCounters, orders } from "@/db/schema";
import { eq, like, desc, sql } from "drizzle-orm";

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

    // Essayer de récupérer le compteur pour l'année en cours avec verrouillage
    const result = await client.query(
      `SELECT id, last_number FROM order_counters WHERE year = $1 FOR UPDATE`,
      [currentYear]
    );

    let nextNumber: number;

    if (result.rows.length === 0) {
      // Première commande de l'année - initialiser le compteur
      // D'abord, vérifier s'il existe des commandes de cette année (migration)
      const existingOrders = await client.query(
        `SELECT order_number FROM orders 
         WHERE order_number LIKE $1 OR order_number LIKE $2
         ORDER BY id DESC LIMIT 1`,
        [`%/${currentYear}`, `%-${currentYear}`]
      );

      if (existingOrders.rows.length > 0) {
        // Extraire le numéro le plus élevé des commandes existantes
        const existingNumber = existingOrders.rows[0].order_number;
        const match = existingNumber.match(/^(\d+)[/-]/);
        nextNumber = match ? parseInt(match[1]) + 1 : 1;
      } else {
        nextNumber = 1;
      }

      // Créer le compteur pour cette année
      await client.query(
        `INSERT INTO order_counters (year, last_number, updated_at) VALUES ($1, $2, NOW())`,
        [currentYear, nextNumber]
      );
    } else {
      // Incrémenter le compteur existant
      nextNumber = result.rows[0].last_number + 1;
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

  if (counter) {
    return `${counter.lastNumber + 1}/${currentYear}`;
  }

  // Si pas de compteur, vérifier les commandes existantes
  const [lastOrder] = await db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(sql`order_number LIKE ${`%/${currentYear}`} OR order_number LIKE ${`%-${currentYear}`}`)
    .orderBy(desc(orders.id))
    .limit(1);

  if (lastOrder?.orderNumber) {
    const match = lastOrder.orderNumber.match(/^(\d+)[/-]/);
    const lastNum = match ? parseInt(match[1]) : 0;
    return `${lastNum + 1}/${currentYear}`;
  }

  return `1/${currentYear}`;
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
