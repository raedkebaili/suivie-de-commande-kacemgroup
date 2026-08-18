export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders, seedDefaultUser } from "@/lib/auth";
import { friendlyDbErrorMessage } from "@/lib/db-error";

export async function GET(request: NextRequest) {
  try {
    await seedDefaultUser();
    const user = await getUserFromHeaders(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    return NextResponse.json({ user });
  } catch (error) {
    console.error("Auth /me error:", error);
    return NextResponse.json({ error: friendlyDbErrorMessage(error) }, { status: 500 });
  }
}
