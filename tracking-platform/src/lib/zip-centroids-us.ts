import raw from "@/data/zip-centroids.json";

type CentroidsFile = {
  version?: string;
  source?: string;
  byZip?: Record<string, [number, number] | number[]>;
};

const EARTH_RADIUS_MILES = 3958.7613;
const file = raw as CentroidsFile;
const byZip = file.byZip || {};

function normZip(postalCode: string): string {
  return String(postalCode || "").replace(/\D/g, "").slice(0, 5);
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function coordsForZipUs(postalCode: string): { lat: number; lng: number } | null {
  const zip = normZip(postalCode);
  if (zip.length !== 5) return null;
  const row = byZip[zip];
  if (!Array.isArray(row) || row.length < 2) return null;
  const lat = Number(row[0]);
  const lng = Number(row[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Great-circle miles between ZIP centroids, or null if either ZIP is unknown. */
export function distanceBetweenZipsMiles(zipA: string, zipB: string): number | null {
  const a = coordsForZipUs(zipA);
  const b = coordsForZipUs(zipB);
  if (!a || !b) return null;
  return haversineMiles(a, b);
}
