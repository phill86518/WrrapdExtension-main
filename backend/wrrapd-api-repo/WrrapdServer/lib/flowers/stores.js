/**
 * Retailer store index from CSVs → retailer-stores-index.json
 * Nearest Publix / Target / Sam's within 4 miles of a giftee ZIP.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const DIR = path.join(__dirname, '..', '..', 'data', 'retailer-stores');
const INDEX_PATH = path.join(DIR, 'retailer-stores-index.json');
const MAX_MILES = 4;
const EARTH_RADIUS_MI = 3958.7613;

let memoryIndex = null;
let memoryMtimeMs = 0;
const zipCoordCache = new Map();

function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(a)));
}

function normZip(z) {
  return String(z || '')
    .replace(/\D/g, '')
    .slice(0, 5);
}

function normState(s) {
  return String(s || '')
    .trim()
    .replace(/^"|"$/g, '')
    .toUpperCase()
    .slice(0, 2);
}

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

/** Minimal CSV parser (handles quoted fields). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some((c) => String(c).trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((c) => String(c).trim() !== '')) rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h || '').trim());
  return rows.slice(1).map((cols) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] != null ? String(cols[idx]).trim() : '';
    });
    return obj;
  });
}

function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== '') return String(row[k]).trim();
  }
  // case-insensitive
  const lower = {};
  for (const [k, v] of Object.entries(row)) lower[k.toLowerCase()] = v;
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (c) => {
        data += c;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function lookupZipCoords(zip) {
  const z = normZip(zip);
  if (z.length !== 5) return null;
  if (zipCoordCache.has(z)) return zipCoordCache.get(z);
  try {
    const j = await httpGetJson(`https://api.zippopotam.us/us/${z}`);
    const place = j?.places?.[0];
    if (!place) {
      zipCoordCache.set(z, null);
      return null;
    }
    const coords = {
      lat: parseFloat(place.latitude),
      lng: parseFloat(place.longitude),
    };
    if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
      zipCoordCache.set(z, null);
      return null;
    }
    zipCoordCache.set(z, coords);
    return coords;
  } catch {
    zipCoordCache.set(z, null);
    return null;
  }
}

function normalizeRow(retailer, row) {
  const state = normState(pick(row, 'state', 'State'));
  if (state !== 'FL' && state !== 'GA') return null;
  const postalCode = normZip(pick(row, 'zip_code', 'Zip', 'zip', 'postalCode', 'postal_code'));
  if (postalCode.length !== 5) return null;
  const address = pick(row, 'address', 'Address');
  const city = pick(row, 'city', 'City');
  if (!address || !city) return null;
  let storeName = pick(row, 'store_name', 'Store Name', 'name', 'Name');
  if (!storeName) {
    storeName =
      retailer === 'publix'
        ? `Publix ${city}`
        : retailer === 'sams'
          ? `Sam's Club ${city}`
          : `Target ${city}`;
  }
  let storeId = pick(row, 'store_id', 'Store ID', 'id', 'ID');
  if (!storeId) {
    storeId = `${retailer}-${postalCode}-${slug(address)}`;
  }
  const phone = pick(row, 'phone', 'Phone');
  const latRaw = pick(row, 'lat', 'latitude', 'Latitude');
  const lngRaw = pick(row, 'lng', 'longitude', 'Longitude');
  const lat = latRaw ? parseFloat(latRaw) : NaN;
  const lng = lngRaw ? parseFloat(lngRaw) : NaN;
  return {
    retailer,
    storeId,
    storeName,
    address,
    city,
    state,
    postalCode,
    phone: phone || undefined,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

async function buildIndexFromCsvs() {
  const files = [
    { retailer: 'target', file: 'target.csv' },
    { retailer: 'publix', file: 'publix.csv' },
    { retailer: 'sams', file: 'sams.csv' },
  ];
  const stores = [];
  for (const { retailer, file } of files) {
    const p = path.join(DIR, file);
    if (!fs.existsSync(p)) {
      console.warn('[flowers-stores] missing CSV', p);
      continue;
    }
    const rows = parseCsv(fs.readFileSync(p, 'utf8'));
    for (const row of rows) {
      const n = normalizeRow(retailer, row);
      if (n) stores.push(n);
    }
  }

  const uniqueZips = [...new Set(stores.map((s) => s.postalCode))];
  for (let i = 0; i < uniqueZips.length; i++) {
    const z = uniqueZips[i];
    if (!zipCoordCache.has(z)) {
      // eslint-disable-next-line no-await-in-loop
      await lookupZipCoords(z);
      if (i % 25 === 0) await new Promise((r) => setTimeout(r, 50));
    }
  }

  for (const s of stores) {
    if (s.lat == null || s.lng == null) {
      const c = zipCoordCache.get(s.postalCode);
      if (c) {
        s.lat = c.lat;
        s.lng = c.lng;
      }
    }
  }

  const withCoords = stores.filter((s) => s.lat != null && s.lng != null);
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    maxMiles: MAX_MILES,
    counts: {
      total: withCoords.length,
      target: withCoords.filter((s) => s.retailer === 'target').length,
      publix: withCoords.filter((s) => s.retailer === 'publix').length,
      sams: withCoords.filter((s) => s.retailer === 'sams').length,
    },
    stores: withCoords,
  };
  fs.writeFileSync(INDEX_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  memoryIndex = payload;
  try {
    memoryMtimeMs = fs.statSync(INDEX_PATH).mtimeMs;
  } catch {
    memoryMtimeMs = Date.now();
  }
  console.log('[flowers-stores] index built', payload.counts);
  return payload;
}

function loadIndex({ force = false } = {}) {
  try {
    if (!force && memoryIndex && fs.existsSync(INDEX_PATH)) {
      const st = fs.statSync(INDEX_PATH);
      if (st.mtimeMs === memoryMtimeMs) return memoryIndex;
    }
    if (!fs.existsSync(INDEX_PATH)) return null;
    memoryIndex = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
    memoryMtimeMs = fs.statSync(INDEX_PATH).mtimeMs;
    return memoryIndex;
  } catch (e) {
    console.error('[flowers-stores] load failed', e.message);
    return memoryIndex;
  }
}

async function ensureIndex() {
  const existing = loadIndex();
  if (existing && Array.isArray(existing.stores) && existing.stores.length) return existing;
  return buildIndexFromCsvs();
}

/**
 * @returns {Promise<{ origin: {lat:number,lng:number}|null, nearby: object[], byRetailer: object }>}
 */
async function nearestStoresForZip(postalCode, maxMiles = MAX_MILES) {
  const index = await ensureIndex();
  const origin = await lookupZipCoords(postalCode);
  if (!origin || !index?.stores?.length) {
    return { origin, nearby: [], byRetailer: { publix: null, target: null, sams: null } };
  }
  const scored = [];
  for (const s of index.stores) {
    if (s.lat == null || s.lng == null) continue;
    const miles = haversineMiles(origin.lat, origin.lng, s.lat, s.lng);
    if (miles <= maxMiles) {
      scored.push({ ...s, miles: Math.round(miles * 100) / 100 });
    }
  }
  scored.sort((a, b) => a.miles - b.miles);
  const byRetailer = { publix: null, target: null, sams: null };
  for (const s of scored) {
    if (!byRetailer[s.retailer]) byRetailer[s.retailer] = s;
  }
  return { origin, nearby: scored, byRetailer };
}

module.exports = {
  MAX_MILES,
  INDEX_PATH,
  DIR,
  haversineMiles,
  buildIndexFromCsvs,
  loadIndex,
  ensureIndex,
  nearestStoresForZip,
  lookupZipCoords,
  normZip,
};
