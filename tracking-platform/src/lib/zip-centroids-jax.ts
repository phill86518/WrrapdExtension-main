import type { Order } from "./types";

/** Jacksonville-area hub for “start route here” heuristics (downtown). */
export const DEFAULT_DEPOT = { lat: 30.3322, lng: -81.6557 };

/**
 * Approximate ZIP centroids for Northeast Florida (no external geocoder).
 * Unknown ZIPs fall back to DEFAULT_DEPOT so routing still runs.
 */
const ZIP_TABLE: Record<string, { lat: number; lng: number }> = {
  "32202": { lat: 30.3248, lng: -81.6627 },
  "32204": { lat: 30.3214, lng: -81.685 },
  "32205": { lat: 30.3228, lng: -81.725 },
  "32207": { lat: 30.296, lng: -81.625 },
  "32210": { lat: 30.279, lng: -81.739 },
  "32216": { lat: 30.287, lng: -81.598 },
  "32217": { lat: 30.252, lng: -81.628 },
  "32218": { lat: 30.374, lng: -81.648 },
  "32224": { lat: 30.288, lng: -81.448 },
  "32225": { lat: 30.319, lng: -81.551 },
  "32244": { lat: 30.228, lng: -81.738 },
  "32246": { lat: 30.252, lng: -81.575 },
  "32250": { lat: 30.162, lng: -81.39 },
  "32256": { lat: 30.245, lng: -81.508 },
};

export function normalizeZip(postalCode: string): string {
  const digits = postalCode.replace(/\D/g, "");
  return digits.slice(0, 5);
}

export function approxCoordsForZip(postalCode: string): { lat: number; lng: number } {
  const z = normalizeZip(postalCode);
  return ZIP_TABLE[z] ?? DEFAULT_DEPOT;
}

export function approxCoordsForOrder(o: Order): { lat: number; lng: number } {
  return approxCoordsForZip(o.postalCode);
}
