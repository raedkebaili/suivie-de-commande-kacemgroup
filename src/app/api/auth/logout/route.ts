export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { db } from "@/db";
import { AUTH_COOKIE_NAME } from "@/lib/auth-cookie";

export async function POST(request: NextRequest) {
  try {
    // db ready
    const user = await getUserFromHeaders(request);
    if (user) await logActivity(user.id, user.username, "LOGOUT", "Déconnexion");
    const response = NextResponse.json({ success: true });
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch {
    return NextResponse.json({ success: true });
  }
}
