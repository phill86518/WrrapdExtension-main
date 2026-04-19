/**
 * Cloud Run often forwards requests to the container with Host=localhost:8080.
 * Next's request.nextUrl.origin then becomes http://localhost:8080, which breaks
 * redirects and absolute links. Prefer forwarded headers, env override, or Referer.
 */

function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase().split(",")[0].trim();
  if (!h) return true;
  const hostname = h.startsWith("[")
    ? h.slice(1, h.indexOf("]") > 0 ? h.indexOf("]") : h.length)
    : h.split(":")[0] ?? h;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0"
  );
}

function originFromUrlString(urlStr: string | null): string | undefined {
  if (!urlStr) return undefined;
  try {
    const u = new URL(urlStr);
    if (isLoopbackHost(u.hostname)) return undefined;
    return u.origin;
  } catch {
    return undefined;
  }
}

export type HeaderGetter = (name: string) => string | null;

/**
 * Canonical public origin for redirects and absolute URLs (no trailing slash).
 */
export function resolvePublicOrigin(
  headerGetter: HeaderGetter,
  fallbackNextOrigin?: string,
): string {
  const rawForwardedHost = headerGetter("x-forwarded-host");
  const rawHost = headerGetter("host");
  const protoRaw =
    headerGetter("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";

  const tryHost = (host: string | null): string | undefined => {
    if (!host) return undefined;
    const hostFirst = host.split(",")[0].trim();
    if (!hostFirst || isLoopbackHost(hostFirst)) return undefined;
    const proto = protoRaw || "https";
    return `${proto}://${hostFirst}`;
  };

  // Prefer the request's real host first so session cookies stay on the same hostname as login
  // (TRACKING_PUBLIC_ORIGIN alone caused redirects to a different host → "login twice").
  const fromForwarded = tryHost(rawForwardedHost);
  if (fromForwarded) return fromForwarded;

  const fromHost = tryHost(rawHost);
  if (fromHost) return fromHost;

  const fromReferer =
    originFromUrlString(headerGetter("referer")) ??
    originFromUrlString(headerGetter("referrer"));
  if (fromReferer) return fromReferer;

  const env = process.env.TRACKING_PUBLIC_ORIGIN?.trim().replace(/\/$/, "");
  if (env) return env;

  if (fallbackNextOrigin) {
    try {
      const u = new URL(fallbackNextOrigin);
      if (!isLoopbackHost(u.hostname)) return u.origin;
    } catch {
      /* ignore */
    }
  }

  return "";
}
