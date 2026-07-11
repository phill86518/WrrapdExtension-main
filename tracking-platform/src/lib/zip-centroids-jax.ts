import type { Order } from "./types";

/**
 * Route start heuristic: Northeast Jax / ~32218 hub (Broward-area staging).
 * Nearest-neighbor + 2-opt order stops from here to approximate driving distance.
 */
export const DEFAULT_DEPOT = { lat: 30.374, lng: -81.648 };

/** Approximate state centroids used when a ZIP is unknown. */
const STATE_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  FL: { lat: 28.6305, lng: -82.4497 },
  GA: { lat: 32.6781, lng: -83.223 },
};

/**
 * Approximate ZIP centroids for Florida + Georgia launch markets (no external geocoder).
 * Unknown ZIPs fall back to nearest known 3-digit prefix, then state, then DEFAULT_DEPOT.
 */
const ZIP_TABLE: Record<string, { lat: number; lng: number }> = {
  // Northeast Florida / Jacksonville
  "32003": { lat: 30.162, lng: -81.74 },
  "32004": { lat: 29.89, lng: -81.31 },
  "32034": { lat: 30.67, lng: -81.46 },
  "32073": { lat: 30.17, lng: -81.76 },
  "32082": { lat: 30.1, lng: -81.41 },
  "32092": { lat: 29.95, lng: -81.55 },
  "32097": { lat: 30.58, lng: -81.68 },
  "32202": { lat: 30.3248, lng: -81.6627 },
  "32204": { lat: 30.3214, lng: -81.685 },
  "32205": { lat: 30.3228, lng: -81.725 },
  "32206": { lat: 30.35, lng: -81.66 },
  "32207": { lat: 30.296, lng: -81.625 },
  "32208": { lat: 30.38, lng: -81.69 },
  "32209": { lat: 30.36, lng: -81.71 },
  "32210": { lat: 30.279, lng: -81.739 },
  "32211": { lat: 30.33, lng: -81.6 },
  "32212": { lat: 30.23, lng: -81.68 },
  "32216": { lat: 30.287, lng: -81.598 },
  "32217": { lat: 30.252, lng: -81.628 },
  "32218": { lat: 30.374, lng: -81.648 },
  "32219": { lat: 30.4, lng: -81.78 },
  "32220": { lat: 30.35, lng: -81.82 },
  "32221": { lat: 30.28, lng: -81.85 },
  "32222": { lat: 30.24, lng: -81.82 },
  "32223": { lat: 30.16, lng: -81.64 },
  "32224": { lat: 30.288, lng: -81.448 },
  "32225": { lat: 30.319, lng: -81.551 },
  "32226": { lat: 30.45, lng: -81.55 },
  "32227": { lat: 30.39, lng: -81.41 },
  "32233": { lat: 30.39, lng: -81.42 },
  "32244": { lat: 30.228, lng: -81.738 },
  "32246": { lat: 30.252, lng: -81.575 },
  "32250": { lat: 30.162, lng: -81.39 },
  "32254": { lat: 30.33, lng: -81.75 },
  "32256": { lat: 30.245, lng: -81.508 },
  "32257": { lat: 30.2, lng: -81.6 },
  "32258": { lat: 30.15, lng: -81.55 },
  "32266": { lat: 30.32, lng: -81.4 },
  "32277": { lat: 30.36, lng: -81.61 },
  // Orlando / Central FL
  "32701": { lat: 28.665, lng: -81.365 },
  "32714": { lat: 28.67, lng: -81.42 },
  "32746": { lat: 28.8, lng: -81.3 },
  "32751": { lat: 28.61, lng: -81.37 },
  "32765": { lat: 28.66, lng: -81.21 },
  "32771": { lat: 28.8, lng: -81.27 },
  "32789": { lat: 28.6, lng: -81.35 },
  "32792": { lat: 28.6, lng: -81.3 },
  "32801": { lat: 28.54, lng: -81.38 },
  "32803": { lat: 28.55, lng: -81.35 },
  "32806": { lat: 28.51, lng: -81.36 },
  "32819": { lat: 28.45, lng: -81.47 },
  "32822": { lat: 28.49, lng: -81.28 },
  "32828": { lat: 28.55, lng: -81.18 },
  "32835": { lat: 28.52, lng: -81.49 },
  "32837": { lat: 28.4, lng: -81.42 },
  // Tampa / St Pete
  "33602": { lat: 27.95, lng: -82.46 },
  "33606": { lat: 27.93, lng: -82.48 },
  "33609": { lat: 27.94, lng: -82.51 },
  "33611": { lat: 27.89, lng: -82.5 },
  "33612": { lat: 28.03, lng: -82.45 },
  "33617": { lat: 28.02, lng: -82.4 },
  "33618": { lat: 28.07, lng: -82.48 },
  "33626": { lat: 28.08, lng: -82.57 },
  "33629": { lat: 27.92, lng: -82.51 },
  "33634": { lat: 28.0, lng: -82.54 },
  "33647": { lat: 28.14, lng: -82.35 },
  "33701": { lat: 27.77, lng: -82.64 },
  "33702": { lat: 27.85, lng: -82.64 },
  "33705": { lat: 27.74, lng: -82.65 },
  "33710": { lat: 27.79, lng: -82.72 },
  "33716": { lat: 27.89, lng: -82.66 },
  "33756": { lat: 27.97, lng: -82.79 },
  "33764": { lat: 27.95, lng: -82.73 },
  "33770": { lat: 28.0, lng: -82.79 },
  // Miami / South FL
  "33125": { lat: 25.79, lng: -80.24 },
  "33126": { lat: 25.78, lng: -80.3 },
  "33131": { lat: 25.76, lng: -80.19 },
  "33133": { lat: 25.73, lng: -80.24 },
  "33134": { lat: 25.75, lng: -80.27 },
  "33139": { lat: 25.79, lng: -80.13 },
  "33140": { lat: 25.82, lng: -80.13 },
  "33141": { lat: 25.85, lng: -80.14 },
  "33143": { lat: 25.7, lng: -80.3 },
  "33156": { lat: 25.66, lng: -80.3 },
  "33157": { lat: 25.61, lng: -80.34 },
  "33160": { lat: 25.93, lng: -80.14 },
  "33172": { lat: 25.79, lng: -80.35 },
  "33176": { lat: 25.66, lng: -80.36 },
  "33178": { lat: 25.84, lng: -80.4 },
  "33180": { lat: 25.96, lng: -80.14 },
  "33186": { lat: 25.66, lng: -80.4 },
  "33301": { lat: 26.12, lng: -80.14 },
  "33304": { lat: 26.14, lng: -80.12 },
  "33308": { lat: 26.19, lng: -80.11 },
  "33312": { lat: 26.1, lng: -80.17 },
  "33317": { lat: 26.12, lng: -80.23 },
  "33324": { lat: 26.12, lng: -80.27 },
  "33401": { lat: 26.71, lng: -80.05 },
  "33408": { lat: 26.84, lng: -80.06 },
  "33410": { lat: 26.84, lng: -80.08 },
  "33411": { lat: 26.7, lng: -80.2 },
  "33414": { lat: 26.64, lng: -80.22 },
  "33418": { lat: 26.85, lng: -80.12 },
  "33431": { lat: 26.37, lng: -80.1 },
  "33433": { lat: 26.35, lng: -80.16 },
  "33445": { lat: 26.45, lng: -80.09 },
  "33458": { lat: 26.93, lng: -80.13 },
  "33467": { lat: 26.61, lng: -80.17 },
  "33480": { lat: 26.69, lng: -80.04 },
  "33483": { lat: 26.46, lng: -80.06 },
  "33486": { lat: 26.35, lng: -80.09 },
  "33496": { lat: 26.4, lng: -80.16 },
  // Tallahassee / Panhandle
  "32301": { lat: 30.43, lng: -84.26 },
  "32303": { lat: 30.48, lng: -84.31 },
  "32308": { lat: 30.47, lng: -84.23 },
  "32312": { lat: 30.55, lng: -84.25 },
  "32501": { lat: 30.42, lng: -87.22 },
  "32503": { lat: 30.47, lng: -87.21 },
  "32504": { lat: 30.5, lng: -87.19 },
  "32507": { lat: 30.34, lng: -87.28 },
  "32514": { lat: 30.54, lng: -87.26 },
  "32541": { lat: 30.38, lng: -86.42 },
  "32550": { lat: 30.37, lng: -86.32 },
  "32578": { lat: 30.47, lng: -86.45 },
  // Georgia — Atlanta metro + Savannah / coastal
  "30004": { lat: 34.1, lng: -84.28 },
  "30022": { lat: 34.03, lng: -84.2 },
  "30024": { lat: 34.07, lng: -84.05 },
  "30030": { lat: 33.77, lng: -84.3 },
  "30033": { lat: 33.82, lng: -84.27 },
  "30040": { lat: 34.2, lng: -84.14 },
  "30041": { lat: 34.19, lng: -84.03 },
  "30043": { lat: 34.0, lng: -84.06 },
  "30062": { lat: 34.0, lng: -84.5 },
  "30066": { lat: 34.04, lng: -84.53 },
  "30067": { lat: 33.94, lng: -84.47 },
  "30075": { lat: 34.03, lng: -84.35 },
  "30076": { lat: 34.0, lng: -84.32 },
  "30080": { lat: 33.89, lng: -84.51 },
  "30097": { lat: 34.05, lng: -84.12 },
  "30101": { lat: 34.07, lng: -84.67 },
  "30114": { lat: 34.24, lng: -84.49 },
  "30126": { lat: 33.84, lng: -84.61 },
  "30127": { lat: 33.8, lng: -84.6 },
  "30144": { lat: 34.08, lng: -84.57 },
  "30188": { lat: 33.91, lng: -84.56 },
  "30213": { lat: 33.58, lng: -84.55 },
  "30236": { lat: 33.53, lng: -84.36 },
  "30253": { lat: 33.45, lng: -84.17 },
  "30263": { lat: 33.37, lng: -84.8 },
  "30269": { lat: 33.49, lng: -84.44 },
  "30281": { lat: 33.52, lng: -84.24 },
  "30294": { lat: 33.67, lng: -84.24 },
  "30305": { lat: 33.83, lng: -84.38 },
  "30306": { lat: 33.79, lng: -84.34 },
  "30307": { lat: 33.77, lng: -84.34 },
  "30308": { lat: 33.77, lng: -84.38 },
  "30309": { lat: 33.8, lng: -84.39 },
  "30312": { lat: 33.74, lng: -84.37 },
  "30318": { lat: 33.79, lng: -84.44 },
  "30319": { lat: 33.87, lng: -84.34 },
  "30324": { lat: 33.82, lng: -84.36 },
  "30326": { lat: 33.85, lng: -84.36 },
  "30327": { lat: 33.87, lng: -84.42 },
  "30328": { lat: 33.92, lng: -84.38 },
  "30338": { lat: 33.94, lng: -84.32 },
  "30339": { lat: 33.88, lng: -84.46 },
  "30341": { lat: 33.89, lng: -84.29 },
  "30342": { lat: 33.87, lng: -84.37 },
  "30345": { lat: 33.85, lng: -84.28 },
  "30346": { lat: 33.93, lng: -84.34 },
  "30350": { lat: 33.98, lng: -84.33 },
  "30360": { lat: 33.94, lng: -84.27 },
  "30501": { lat: 34.3, lng: -83.83 },
  "30518": { lat: 34.1, lng: -84.03 },
  "30519": { lat: 34.07, lng: -83.94 },
  "30606": { lat: 33.94, lng: -83.42 },
  "30907": { lat: 33.5, lng: -82.08 },
  "31210": { lat: 32.89, lng: -83.72 },
  "31401": { lat: 32.08, lng: -81.09 },
  "31405": { lat: 32.05, lng: -81.15 },
  "31406": { lat: 31.98, lng: -81.12 },
  "31410": { lat: 32.02, lng: -80.99 },
  "31419": { lat: 31.98, lng: -81.2 },
  "31520": { lat: 31.17, lng: -81.49 },
  "31525": { lat: 31.25, lng: -81.48 },
  "31701": { lat: 31.58, lng: -84.16 },
  "31904": { lat: 32.51, lng: -84.96 },
  "31907": { lat: 32.47, lng: -84.92 },
  "31909": { lat: 32.55, lng: -84.95 },
};

export function normalizeZip(postalCode: string): string {
  const digits = postalCode.replace(/\D/g, "");
  return digits.slice(0, 5);
}

function nearestPrefixCentroid(z: string): { lat: number; lng: number } | null {
  if (z.length < 3) return null;
  const prefix = z.slice(0, 3);
  let best: { lat: number; lng: number } | null = null;
  let bestDist = Infinity;
  for (const [zip, coords] of Object.entries(ZIP_TABLE)) {
    if (!zip.startsWith(prefix)) continue;
    // Prefer exact prefix match first entry as representative
    const d = Math.abs(Number(zip) - Number(z));
    if (d < bestDist) {
      bestDist = d;
      best = coords;
    }
  }
  return best;
}

export function approxCoordsForZip(
  postalCode: string,
  stateHint?: string,
): { lat: number; lng: number } {
  const z = normalizeZip(postalCode);
  if (ZIP_TABLE[z]) return ZIP_TABLE[z]!;
  const prefix = nearestPrefixCentroid(z);
  if (prefix) return prefix;
  const st = (stateHint || "").toUpperCase();
  if (st && STATE_CENTROIDS[st]) return STATE_CENTROIDS[st]!;
  // FL ZIPs roughly 32xxx–34xxx; GA roughly 30xxx–31xxx
  if (z.startsWith("3") && Number(z) >= 32000 && Number(z) < 35000) return STATE_CENTROIDS.FL!;
  if (z.startsWith("3") && Number(z) >= 30000 && Number(z) < 32000) return STATE_CENTROIDS.GA!;
  return DEFAULT_DEPOT;
}

export function approxCoordsForOrder(o: Order): { lat: number; lng: number } {
  return approxCoordsForZip(o.postalCode, o.state);
}

/** Haversine distance in kilometers. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
