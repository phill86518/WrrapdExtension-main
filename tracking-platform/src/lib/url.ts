import { NextRequest } from "next/server";

export function getRequestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  if (!host) return request.nextUrl.origin;

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const isLocalHost = host.includes("localhost") || host.startsWith("127.0.0.1");
  const protocol = forwardedProto || (isLocalHost ? "http" : "https");
  return `${protocol}://${host}`;
}

export function buildRedirectUrl(request: NextRequest, path: string): URL {
  return new URL(path, getRequestOrigin(request));
}
