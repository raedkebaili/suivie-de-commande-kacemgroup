import { NextResponse } from "next/server";
import { getUserFromHeaders, type UserPayload } from "@/lib/auth";

export type AuthResult = { ok: true; user: UserPayload } | { ok: false; status: number; error: string };

export async function checkAuth(request: Request, allowedRoles?: string[]): Promise<AuthResult> {
  const user = await getUserFromHeaders(request);
  if (!user) return { ok: false, status: 401, error: "Non authentifié" };
  if (allowedRoles && !allowedRoles.includes(user.role)) return { ok: false, status: 403, error: "Accès refusé" };
  return { ok: true, user };
}

export function authError(result: AuthResult & { ok: false }): NextResponse {
  return NextResponse.json({ error: result.error }, { status: result.status });
}
