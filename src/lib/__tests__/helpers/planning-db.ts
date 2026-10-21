import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { SQL } from "drizzle-orm";
import { orders, orderItems, productionBatches, expeditionBatches, productionPlanEntries, expeditionPlanEntries, activityLogs } from "@/db/schema";

// Même colonnes, types, NOT NULL et défauts que le schéma applicatif, sans les
// tables de comptes / catalogues hors périmètre. PostgreSQL réel, pas de mock SQL.
export const planningTables = [orders, orderItems, productionBatches, expeditionBatches, productionPlanEntries, expeditionPlanEntries, activityLogs];
export async function createPlanningDatabase() {
  const client = new PGlite();
  const dialect = new PgDialect();
  for (const table of planningTables) {
    const config = getTableConfig(table);
    const columns = config.columns.map(column => {
      let definition = `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}${column.notNull ? " NOT NULL" : ""}`;
      if (column.default !== undefined) {
        const value = column.default;
        const expression = value instanceof SQL ? dialect.sqlToQuery(value).sql
          : typeof value === "string" ? `'${value.replaceAll("'", "''")}'` : String(value);
        definition += ` DEFAULT ${expression}`;
      }
      return definition;
    });
    await client.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
  }
  const database = drizzle(client);
  return { client, database };
}
