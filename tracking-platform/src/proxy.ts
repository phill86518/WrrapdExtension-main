import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "wrrapd_session";

type SessionPayload = {
  role?: "admin" | "driver";
};

async function readRole(request: NextRequest): Promise<"admin" | "driver" | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const secret = new TextEncoder().encode(
    process.env.APP_SESSION_SECRET || "local-dev-secret-change-in-prod",
  );
  try {
    const { payload } = await jwtVerify(token, secret);
    return (payload as SessionPayload).role || null;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const role = await readRole(request);
  const path = request.nextUrl.pathname;

  if (path.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL("/admin", request.url));
  }
  if (path.startsWith("/driver") && role !== "driver") {
    return NextResponse.redirect(new URL("/driver", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/orders/:path*"],
};
