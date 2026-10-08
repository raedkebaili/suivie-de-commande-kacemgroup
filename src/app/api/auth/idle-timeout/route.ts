export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { getUserFromHeaders } from "@/lib/auth";
import { parseSessionIdleTimeoutMinutes, SESSION_IDLE_TIMEOUT_KEY } from "@/lib/session-timeout";

export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const [setting] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, SESSION_IDLE_TIMEOUT_KEY))
    .limit(1);

  return NextResponse.json({ idleTimeoutMinutes: parseSessionIdleTimeoutMinutes(setting?.value) });
}
