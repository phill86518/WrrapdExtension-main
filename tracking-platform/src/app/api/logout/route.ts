import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookieOnResponse } from "@/lib/auth";
import { resolvePublicOrigin } from "@/lib/public-origin";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookieOnResponse(res);
  return res;
}

/** Only allow same-origin relative paths (open-redirect safe). */
function safeInternalPath(raw: string | null): string {
  if (!raw) return "/driver";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/driver";
  return raw;
}

export async function GET(request: NextRequest) {
  /** Deploy probe on the same handler path that already returns 302 on Cloud Run. */
  if (request.nextUrl.searchParams.get("__wrrapdBuild") === "1") {
    return NextResponse.json(
      {
        marker: "wrrapd-build-via-logout-get",
        kRevision: process.env.K_REVISION ?? null,
        timeUtc: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const path = safeInternalPath(request.nextUrl.searchParams.get("redirect"));
  const origin = resolvePublicOrigin(
    (name) => request.headers.get(name),
    request.nextUrl.origin,
  );
  const base = origin || request.nextUrl.origin;
  const url = new URL(path, base);
  const res = NextResponse.redirect(url, 302);
  /** GET must not clear the session — prefetchers and crawlers hit links; use POST /api/logout to sign out. */
  res.headers.set("Cache-Control", "no-store");
  return res;
}
