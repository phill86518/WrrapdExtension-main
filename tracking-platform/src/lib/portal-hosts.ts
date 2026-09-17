/**
 * Contractor portal hostnames (Cloud Run domain mappings on the same `wrrapd-tracking` service).
 *
 *   wrapstar.wrrapd.com   → WrapStar App   (/wrapstar)
 *   joyrider.wrrapd.com   → JoyRider App   (/courier — code/URL slug still says courier/driver)
 *   wraprider.wrrapd.com  → WrapRider App  (/wraprider — third hire track, own login)
 *
 * Override with WRAPSTAR_PORTAL_HOST / JOYRIDER_PORTAL_HOST / WRAPRIDER_PORTAL_HOST
 * (comma-separated aliases allowed). Setup runbook: docs/CONTRACTOR-PORTALS.md
 */

function hostList(envValue: string | undefined, fallback: string): string[] {
  const raw = (envValue || fallback)
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return raw.length ? raw : [fallback];
}

export const WRAPSTAR_PORTAL_HOSTS = hostList(
  process.env.WRAPSTAR_PORTAL_HOST,
  "wrapstar.wrrapd.com",
);
export const JOYRIDER_PORTAL_HOSTS = hostList(
  process.env.JOYRIDER_PORTAL_HOST,
  "joyrider.wrrapd.com",
);
export const WRAPRIDER_PORTAL_HOSTS = hostList(
  process.env.WRAPRIDER_PORTAL_HOST,
  "wraprider.wrrapd.com",
);

export type PortalKind = "wrapstar" | "joyrider" | "wraprider";

export type PortalHomePath = "/wrapstar" | "/courier" | "/wraprider";

export const PORTAL_HOME_PATHS: Record<PortalKind, PortalHomePath> = {
  wrapstar: "/wrapstar",
  joyrider: "/courier",
  wraprider: "/wraprider",
};

/** Strip port and pick the first forwarded host. */
export function normalizeHost(host: string | null | undefined): string {
  if (!host) return "";
  return host.split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

export function portalKindForHost(host: string | null | undefined): PortalKind | null {
  const h = normalizeHost(host);
  if (!h) return null;
  if (WRAPSTAR_PORTAL_HOSTS.includes(h)) return "wrapstar";
  if (JOYRIDER_PORTAL_HOSTS.includes(h)) return "joyrider";
  if (WRAPRIDER_PORTAL_HOSTS.includes(h)) return "wraprider";
  return null;
}

/** App path the portal host should land on. */
export function portalHomePath(kind: PortalKind): PortalHomePath {
  return PORTAL_HOME_PATHS[kind];
}

/** The other contractor app paths — redirected back home on a portal host. */
export function otherPortalPaths(kind: PortalKind): PortalHomePath[] {
  return (Object.keys(PORTAL_HOME_PATHS) as PortalKind[])
    .filter((k) => k !== kind)
    .map((k) => PORTAL_HOME_PATHS[k]);
}

/** Public URL for the WrapStar app (emails, links). */
export function wrapstarPortalUrl(): string {
  return `https://${WRAPSTAR_PORTAL_HOSTS[0]}/`;
}

/** Public URL for the JoyRider app (emails, links). */
export function joyriderPortalUrl(): string {
  return `https://${JOYRIDER_PORTAL_HOSTS[0]}/`;
}

/** Public URL for the WrapRider app (emails, links). */
export function wrapriderPortalUrl(): string {
  return `https://${WRAPRIDER_PORTAL_HOSTS[0]}/`;
}
