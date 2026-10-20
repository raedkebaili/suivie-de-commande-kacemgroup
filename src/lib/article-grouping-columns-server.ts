import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { GROUPING_COLUMNS_SETTING, parseGroupingColumns } from "./article-grouping-columns";
export async function readGroupingColumns() {
  const [setting] = await db.select({ value: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, GROUPING_COLUMNS_SETTING));
  return parseGroupingColumns(setting?.value);
}
