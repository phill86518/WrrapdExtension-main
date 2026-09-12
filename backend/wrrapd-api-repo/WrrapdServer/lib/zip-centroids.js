/**
 * US ZIP5 → centroid (lat/lng) + radius search.
 * Data: ../data/zip-centroids.json (US Census 2020 Gazetteer, ZCTA5 internal points).
 *
 * Used for "is there a WrapStar with a printer within N miles of this giftee ZIP?"
 * style coverage questions. Distances are great-circle (haversine) in statute miles.
 */
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'zip-centroids.json');
const EARTH_RADIUS_MILES = 3958.7613;

let cached = null;

function load() {
  if (cached) return cached;
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    cached = {
      version: parsed.version || null,
      source: parsed.source || null,
      byZip: parsed.byZip || {},
    };
  } catch (e) {
    console.error('[zip-centroids] failed to load', e && e.message ? e.message : e);
    cached = { version: null, source: null, byZip: {} };
  }
  return cached;
}

function normZip(z) {
  return String(z || '')
    .replace(/\D/g, '')
    .slice(0, 5);
}

/** @returns {{ zip: string, lat: number, lng: number } | null} */
function coordsForZip(postalCode) {
  const zip = normZip(postalCode);
  if (zip.length !== 5) return null;
  const row = load().byZip[zip];
  if (!Array.isArray(row) || row.length < 2) return null;
  return { zip, lat: Number(row[0]), lng: Number(row[1]) };
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in miles between two {lat,lng} points. */
function haversineMiles(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance in miles between two ZIP centroids, or null if either is unknown. */
function distanceBetweenZipsMiles(zipA, zipB) {
  const a = coordsForZip(zipA);
  const b = coordsForZip(zipB);
  if (!a || !b) return null;
  return haversineMiles(a, b);
}

/**
 * All ZIPs whose centroid is within `radiusMiles` of the given ZIP's centroid.
 * Uses a cheap latitude/longitude bounding box before the haversine pass.
 * @returns {Array<{ zip: string, distanceMiles: number }>} sorted nearest-first (includes the origin ZIP at 0)
 */
function zipsWithinRadius(originZip, radiusMiles) {
  const origin = coordsForZip(originZip);
  const radius = Number(radiusMiles);
  if (!origin || !Number.isFinite(radius) || radius <= 0) return [];
  const byZip = load().byZip;
  const latDelta = radius / 69.0; // ~69 statute miles per degree latitude
  const cosLat = Math.max(0.05, Math.cos(toRad(origin.lat)));
  const lngDelta = radius / (69.172 * cosLat);
  const out = [];
  for (const zip in byZip) {
    const row = byZip[zip];
    const lat = row[0];
    const lng = row[1];
    if (Math.abs(lat - origin.lat) > latDelta) continue;
    if (Math.abs(lng - origin.lng) > lngDelta) continue;
    const d = haversineMiles(origin, { lat, lng });
    if (d <= radius) out.push({ zip, distanceMiles: Math.round(d * 10) / 10 });
  }
  out.sort((a, b) => a.distanceMiles - b.distanceMiles || (a.zip < b.zip ? -1 : 1));
  return out;
}

function getMeta() {
  const data = load();
  return {
    version: data.version,
    source: data.source,
    zipCount: Object.keys(data.byZip).length,
  };
}

module.exports = {
  DATA_PATH,
  normZip,
  coordsForZip,
  haversineMiles,
  distanceBetweenZipsMiles,
  zipsWithinRadius,
  getMeta,
};
