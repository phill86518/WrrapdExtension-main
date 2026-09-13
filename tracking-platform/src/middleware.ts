import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, SignJWT } from "jose";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
  getSessionSecretBytes,
} from "@/lib/session-constants";
import { portalHomePath, portalKindForHost } from "@/lib/portal-hosts";

type SessionPayload = {
  role: "admin" | "wrapstar" | "driver";
  userId: string;
  name: string;
};

const secret = getSessionSecretBytes();

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  /**
   * Contractor portal hosts: wrapstar.wrrapd.com → /wrapstar, joyrider.wrrapd.com → /courier.
   * The root of each host rewrites to its app (URL bar stays clean); the *other* contractor app
   * and Command Center redirect away so one host = one audience.
   */
  const portal = portalKindForHost(
    request.headers.get("x-forwarded-host") || request.headers.get("host"),
  );
  if (portal) {
    const home = portalHomePath(portal);
    const other = portal === "wrapstar" ? "/courier" : "/wrapstar";
    if (pathname === "/" || pathname === "/platform") {
      const u = request.nextUrl.clone();
      u.pathname = home;
      return NextResponse.rewrite(u);
    }
    if (
      pathname === other ||
      pathname.startsWith(`${other}/`) ||
      pathname === "/admin" ||
      pathname.startsWith("/admin/") ||
      pathname === "/driver" ||
      pathname.startsWith("/driver/")
    ) {
      const u = request.nextUrl.clone();
      u.pathname = home;
      u.search = "";
      return NextResponse.redirect(u);
    }
  }
  /** Case aliases (Windows / typed URLs); lowercase routes are canonical. */
  if (pathname === "/Admin" || pathname.startsWith("/Admin/")) {
    const u = request.nextUrl.clone();
    u.pathname = `/admin${pathname.slice("/Admin".length)}`;
    return NextResponse.redirect(u);
  }
  if (pathname === "/Driver" || pathname.startsWith("/Driver/")) {
    const u = request.nextUrl.clone();
    u.pathname = `/courier${pathname.slice("/Driver".length)}`;
    return NextResponse.redirect(u);
  }
  if (pathname === "/driver" || pathname.startsWith("/driver/")) {
    const u = request.nextUrl.clone();
    u.pathname = `/courier${pathname.slice("/driver".length)}`;
    return NextResponse.redirect(u);
  }
  if (pathname === "/Wrapstar" || pathname.startsWith("/Wrapstar/")) {
    const u = request.nextUrl.clone();
    u.pathname = `/wrapstar${pathname.slice("/Wrapstar".length)}`;
    return NextResponse.redirect(u);
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return NextResponse.next();
  try {
    const { payload } = await jwtVerify(token, secret, { clockTolerance: 300 });
    const p = payload as SessionPayload;
    if (!p?.role || !p.userId || !p.name) return NextResponse.next();
    const fresh = await new SignJWT({ role: p.role, userId: p.userId, name: p.name })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC)
      .sign(secret);
    const res = NextResponse.next();
    res.cookies.set(SESSION_COOKIE_NAME, fresh, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SEC,
    });
    return res;
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    "/",
    "/platform",
    "/admin",
    "/admin/:path*",
    "/driver/:path*",
    "/courier/:path*",
    "/wrapstar/:path*",
    "/Admin",
    "/Admin/:path*",
    "/Driver",
    "/Driver/:path*",
    "/Wrapstar",
    "/Wrapstar/:path*",
  ],
};
