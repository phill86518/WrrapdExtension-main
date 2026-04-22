import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, SignJWT } from "jose";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
  getSessionSecretBytes,
} from "@/lib/session-constants";

type SessionPayload = {
  role: "admin" | "driver";
  userId: string;
  name: string;
};

const secret = getSessionSecretBytes();

export async function middleware(request: NextRequest) {
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
  matcher: ["/admin/:path*", "/driver/:path*"],
};
