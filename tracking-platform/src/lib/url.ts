import { NextRequest } from "next/server";
import { resolvePublicOrigin } from "@/lib/public-origin";

export function getRequestOrigin(request: NextRequest): string {
  const origin = resolvePublicOrigin(
    (name) => request.headers.get(name),
    request.nextUrl.origin,
  );
  return origin || request.nextUrl.origin;
}

export function buildRedirectUrl(request: NextRequest, path: string): URL {
  return new URL(path, getRequestOrigin(request));
}

/**
 * Only allow same-origin relative Command Center paths after login
 * (blocks open redirects).
 */
export function safeAdminNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const next = raw.trim();
  if (!next.startsWith("/admin")) return null;
  if (next.startsWith("//") || next.includes("://") || next.includes("\\")) return null;
  if (next.includes("\n") || next.includes("\r")) return null;
  return next;
}
