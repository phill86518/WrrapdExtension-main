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
