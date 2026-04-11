import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}

/** Only allow same-origin relative paths (open-redirect safe). */
function safeInternalPath(raw: string | null): string {
  if (!raw) return "/driver";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/driver";
  return raw;
}

export async function GET(request: NextRequest) {
  await clearSessionCookie();
  const path = safeInternalPath(request.nextUrl.searchParams.get("redirect"));
  const url = new URL(path, request.nextUrl.origin);
  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
