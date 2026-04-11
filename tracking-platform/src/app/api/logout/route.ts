import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest) {
  await clearSessionCookie();
  const next = request.nextUrl.searchParams.get("redirect") || "/driver";
  return NextResponse.redirect(new URL(next, request.url));
}
