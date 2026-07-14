import type { Metro, MetroId, WrapStar } from "./types";
import { normalizeZip } from "./zip-centroids-jax";

/** Default: allocate a Driver for wrap-only markets once this many wrap-only WrapStars are active. */
export const DEFAULT_DRIVER_UNLOCK_MIN_WRAP_ONLY = 3;

/**
 * Launch metros. ZIP prefixes are 3-digit USPS groups covering the centroids
 * we already ship in zip-centroids-jax.ts (plus nearby prefixes for ops).
 */
export const METROS: Metro[] = [
  {
    id: "jacksonville",
    name: "Jacksonville",
    zipPrefixes: ["320", "322"],
    driverUnlockMinWrapOnlyCount: DEFAULT_DRIVER_UNLOCK_MIN_WRAP_ONLY,
  },
  {
    id: "orlando",
    name: "Orlando",
    zipPrefixes: ["327", "328"],
    driverUnlockMinWrapOnlyCount: DEFAULT_DRIVER_UNLOCK_MIN_WRAP_ONLY,
  },
  {
    id: "tampa",
    name: "Tampa",
    zipPrefixes: ["336", "337"],
    driverUnlockMinWrapOnlyCount: DEFAULT_DRIVER_UNLOCK_MIN_WRAP_ONLY,
  },
  {
    id: "miami",
    name: "Miami",
    zipPrefixes: ["331", "330"],
    driverUnlockMinWrapOnlyCount: DEFAULT_DRIVER_UNLOCK_MIN_WRAP_ONLY,
  },
  {
    id: "fort_lauderdale",
    name: "Fort Lauderdale",
    zipPrefixes: ["333", "334"],
    driverUnlockMinWrapOnlyCount: DEFAULT_DRIVER_UNLOCK_MIN_WRAP_ONLY,
  },
  {
    id: "atlanta",
    name: "Atlanta",
    zipPrefixes: ["300", "301", "302", "303", "305", "306", "311"],
    driverUnlockMinWrapOnlyCount: DEFAULT_DRIVER_UNLOCK_MIN_WRAP_ONLY,
  },
  {
    id: "savannah",
    name: "Savannah",
    zipPrefixes: ["313", "314", "315"],
    driverUnlockMinWrapOnlyCount: DEFAULT_DRIVER_UNLOCK_MIN_WRAP_ONLY,
  },
];

const BY_ID = Object.fromEntries(METROS.map((m) => [m.id, m])) as Record<MetroId, Metro>;

export function listMetros(): Metro[] {
  return METROS;
}

export function getMetro(id: MetroId | string | undefined): Metro | undefined {
  if (!id) return undefined;
  return BY_ID[id as MetroId];
}

export function metroForPostalCode(postalCode: string): Metro | undefined {
  const z = normalizeZip(postalCode);
  if (z.length < 3) return undefined;
  const prefix = z.slice(0, 3);
  // Prefer more specific / non-overlapping matches; Fort Lauderdale before generic FL
  for (const metro of METROS) {
    if (metro.zipPrefixes.includes(prefix)) return metro;
  }
  return undefined;
}

export function isWrapOnly(ws: Pick<WrapStar, "canDeliver" | "wrapOnly">): boolean {
  if (ws.wrapOnly === true) return true;
  if (ws.canDeliver === false) return true;
  return false;
}

/** Count approved wrap-only WrapStars whose home ZIP falls in the metro. */
export function countWrapOnlyInMetro(
  metroId: MetroId,
  wrapstars: Array<Pick<WrapStar, "homePostalCode" | "canDeliver" | "wrapOnly" | "metroId">>,
): number {
  const metro = getMetro(metroId);
  if (!metro) return 0;
  return wrapstars.filter((w) => {
    if (!isWrapOnly(w)) return false;
    if (w.metroId === metroId) return true;
    const m = metroForPostalCode(w.homePostalCode);
    return m?.id === metroId;
  }).length;
}

export function isDriverNetworkUnlocked(
  metroId: MetroId,
  wrapOnlyCount: number,
  overrideUnlock?: boolean,
): boolean {
  if (overrideUnlock) return true;
  const metro = getMetro(metroId);
  const need = metro?.driverUnlockMinWrapOnlyCount ?? DEFAULT_DRIVER_UNLOCK_MIN_WRAP_ONLY;
  return wrapOnlyCount >= need;
}
