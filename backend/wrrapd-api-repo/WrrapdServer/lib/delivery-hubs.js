/**
 * Wrrapd delivery hubs — the ship-to address retailers send wrapped items to.
 *
 * A hub is usually a PO Box or a USPS Premium PO Box with street addressing
 * (e.g. "150 BUSCH DR #26067"). Each giftee ZIP is served by the ACTIVE hub whose
 * ZIP centroid is closest (great-circle miles). If the giftee ZIP has no known
 * centroid, the default hub is used.
 *
 * Stored in data/delivery-hubs.json — edited from Command Center → Allowed ZIP codes →
 * Delivery hubs. The extension asks GET /api/delivery-hub?postalCode= after the shopper
 * submits the giftee ZIP in the gift modal.
 *
 * A giftee ZIP is deliverable only when it is also within HUB_SERVICE_RADIUS_MILES of an
 * active hub. The public allowlist is filtered to that set. The stored allowlist is not.
 */
const fs = require('fs');
const path = require('path');
const zipCentroids = require('./zip-centroids');
const zipCounty = require('./zip-county');

const DATA_PATH =
  process.env.WRRAPD_DELIVERY_HUBS_PATH || path.join(__dirname, '..', 'data', 'delivery-hubs.json');

/** Shoppers farther than this from every active hub get the out-of-area ZIP message. */
const HUB_SERVICE_RADIUS_MILES = 50;

const HUB_KINDS = Object.freeze({
  'premium-po-box': 'Premium PO Box (street address)',
  'po-box': 'PO Box',
  street: 'Street address',
});

const STATE_NAMES = Object.freeze({
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico',
});

/** Used only when data/delivery-hubs.json is missing or unreadable. */
const SEED_HUB = Object.freeze({
  id: 'jax-1',
  name: 'Jacksonville',
  kind: 'premium-po-box',
  organization: 'WRRAPD INC',
  displayName: 'Wrrapd',
  recipientFirstName: 'WRRAPD',
  recipientLastName: 'INC',
  addressLine1: '150 BUSCH DR #26067',
  addressLine2: '',
  city: 'JACKSONVILLE',
  state: 'FL',
  postalCode: '32218',
  phone: '(904) 515-2034',
  active: true,
  notes: 'Premium PO Box 26067 with street addressing.',
});

let memoryCache = null;
let memoryMtimeMs = 0;

function normZip(z) {
  return String(z || '')
    .replace(/\D/g, '')
    .slice(0, 5);
}

function clean(v, max = 120) {
  return String(v == null ? '' : v)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function shipLinesFor(h) {
  return [
    h.organization || [h.recipientFirstName, h.recipientLastName].filter(Boolean).join(' '),
    h.addressLine1,
    h.addressLine2,
    `${h.city} ${h.state} ${h.postalCode}`.trim(),
  ].filter(Boolean);
}

/** @returns normalized hub or null when the address is incomplete. */
function normalizeHub(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const postalCode = normZip(raw.postalCode || raw.zip);
  const addressLine1 = clean(raw.addressLine1).toUpperCase();
  const city = clean(raw.city, 60).toUpperCase();
  const state = clean(raw.state, 2).toUpperCase();
  if (postalCode.length !== 5 || !addressLine1 || !city || !STATE_NAMES[state]) return null;
  const name = clean(raw.name, 60) || `${city.charAt(0)}${city.slice(1).toLowerCase()} hub`;
  const id = clean(raw.id, 60) || `hub-${postalCode}-${slug(name) || 'hub'}`;
  const kind = HUB_KINDS[raw.kind] ? raw.kind : 'premium-po-box';
  const organization = clean(raw.organization, 60).toUpperCase() || 'WRRAPD INC';
  const [orgFirst, ...orgRest] = organization.split(' ');
  return {
    id,
    name,
    kind,
    organization,
    displayName: clean(raw.displayName, 60) || 'Wrrapd',
    recipientFirstName: clean(raw.recipientFirstName, 40).toUpperCase() || orgFirst || 'WRRAPD',
    recipientLastName: clean(raw.recipientLastName, 40).toUpperCase() || orgRest.join(' ') || 'INC',
    addressLine1,
    addressLine2: clean(raw.addressLine2).toUpperCase(),
    city,
    state,
    postalCode,
    phone: clean(raw.phone, 30),
    active: raw.active !== false,
    notes: clean(raw.notes, 500),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}

function normalizePayload(parsed) {
  const seen = new Set();
  const hubs = [];
  for (const raw of Array.isArray(parsed && parsed.hubs) ? parsed.hubs : []) {
    const h = normalizeHub(raw);
    if (!h || seen.has(h.id)) continue;
    seen.add(h.id);
    hubs.push(h);
  }
  if (!hubs.length) hubs.push(normalizeHub(SEED_HUB));
  let defaultHubId = clean(parsed && parsed.defaultHubId, 60);
  const activeIds = hubs.filter((h) => h.active).map((h) => h.id);
  if (!activeIds.length) {
    hubs[0].active = true;
    activeIds.push(hubs[0].id);
  }
  if (!activeIds.includes(defaultHubId)) defaultHubId = activeIds[0];
  return {
    defaultHubId,
    updatedAt: typeof (parsed && parsed.updatedAt) === 'string' ? parsed.updatedAt : null,
    hubs,
  };
}

function loadHubs({ force = false } = {}) {
  try {
    const st = fs.statSync(DATA_PATH);
    if (!force && memoryCache && st.mtimeMs === memoryMtimeMs) return memoryCache;
    memoryCache = normalizePayload(JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')));
    memoryMtimeMs = st.mtimeMs;
    return memoryCache;
  } catch (e) {
    if (e && e.code !== 'ENOENT') {
      console.error('[delivery-hubs] load failed', e && e.message ? e.message : e);
    }
    if (memoryCache) return memoryCache;
    memoryCache = normalizePayload({ hubs: [SEED_HUB] });
    return memoryCache;
  }
}

function savePayload(next) {
  const payload = normalizePayload(next);
  payload.updatedAt = new Date().toISOString();
  const tmp = `${DATA_PATH}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, DATA_PATH);
  memoryCache = payload;
  try {
    memoryMtimeMs = fs.statSync(DATA_PATH).mtimeMs;
  } catch {
    memoryMtimeMs = Date.now();
  }
  return memoryCache;
}

function activeHubs() {
  return loadHubs().hubs.filter((h) => h.active);
}

function defaultHub() {
  const data = loadHubs();
  return data.hubs.find((h) => h.id === data.defaultHubId) || activeHubs()[0];
}

/** Ship-to shape the extension fills into retailer checkouts (no admin-only fields). */
function publicHub(h) {
  if (!h) return null;
  return {
    hubId: h.id,
    organization: h.organization,
    displayName: h.displayName,
    recipientFirstName: h.recipientFirstName,
    recipientLastName: h.recipientLastName,
    addressLine1: h.addressLine1,
    addressLine2: h.addressLine2,
    city: h.city,
    state: h.state,
    stateName: STATE_NAMES[h.state] || h.state,
    postalCode: h.postalCode,
    country: 'US',
    phone: h.phone,
    shipLines: shipLinesFor(h),
  };
}

/**
 * Closest active hub to the giftee ZIP.
 * @returns {{ hub: object, distanceMiles: number|null, matched: 'nearest'|'default' }}
 */
function nearestHub(postalCode) {
  const zip = normZip(postalCode);
  const fallback = defaultHub();
  const origin = zip.length === 5 ? zipCentroids.coordsForZip(zip) : null;
  if (!origin) return { hub: fallback, distanceMiles: null, matched: 'default' };
  let best = null;
  for (const h of activeHubs()) {
    const at = zipCentroids.coordsForZip(h.postalCode);
    if (!at) continue;
    const d = zipCentroids.haversineMiles(origin, at);
    const isBetter =
      !best ||
      d < best.distanceMiles - 1e-9 ||
      (Math.abs(d - best.distanceMiles) <= 1e-9 && h.id === fallback.id);
    if (isBetter) best = { hub: h, distanceMiles: d };
  }
  if (!best) return { hub: fallback, distanceMiles: null, matched: 'default' };
  return { hub: best.hub, distanceMiles: Math.round(best.distanceMiles * 10) / 10, matched: 'nearest' };
}

function activeHubPoints() {
  const points = [];
  for (const h of activeHubs()) {
    const at = zipCentroids.coordsForZip(h.postalCode);
    if (at) points.push(at);
  }
  return points;
}

/** True when the ZIP center is within 50 miles of an active hub. Unknown ZIPs are not. */
function zipWithinActiveHubRadius(postalCode, hubPoints) {
  const origin = zipCentroids.coordsForZip(normZip(postalCode));
  if (!origin) return false;
  const points = hubPoints || activeHubPoints();
  const latDelta = HUB_SERVICE_RADIUS_MILES / 69.0;
  const cosLat = Math.max(0.05, Math.cos((origin.lat * Math.PI) / 180));
  const lngDelta = HUB_SERVICE_RADIUS_MILES / (69.172 * cosLat);
  for (const at of points) {
    if (Math.abs(at.lat - origin.lat) > latDelta) continue;
    if (Math.abs(at.lng - origin.lng) > lngDelta) continue;
    if (zipCentroids.haversineMiles(origin, at) <= HUB_SERVICE_RADIUS_MILES) return true;
  }
  return false;
}

/** Allowlist ZIPs a shopper may use: on the stored list and within range of a hub. */
function filterZipsWithinHubRadius(zips) {
  const points = activeHubPoints();
  if (!points.length) return [];
  const out = [];
  for (const raw of zips || []) {
    const z = normZip(raw);
    if (z.length === 5 && zipWithinActiveHubRadius(z, points)) out.push(z);
  }
  return out;
}

/** Shopper-safe answer for the extension. */
function publicHubForZip(postalCode) {
  const zip = normZip(postalCode);
  const { hub } = nearestHub(zip);
  return { postalCode: zip, hub: publicHub(hub) };
}

/** True when an address object is any configured hub (active or not). */
function isHubAddress(addr) {
  if (!addr || typeof addr !== 'object') return false;
  const street = String(addr.street || addr.line1 || addr.addressLine1 || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
  const zip = normZip(addr.postalCode || addr.postal_code);
  if (!street) return false;
  return loadHubs().hubs.some((h) => street.startsWith(h.addressLine1) && (!zip || zip === h.postalCode));
}

function upsertHub(input) {
  const cur = loadHubs({ force: true });
  const id = clean(input && input.id, 60);
  const prev = id ? cur.hubs.find((h) => h.id === id) : null;
  const incoming = normalizeHub({
    ...(prev || {}),
    ...input,
    id: prev ? prev.id : id || undefined,
    active: input && input.active != null ? input.active : prev ? prev.active : true,
    updatedAt: new Date().toISOString(),
  });
  if (!incoming) {
    throw new Error('A hub needs street / box line, city, 2-letter state, and a 5-digit ZIP.');
  }
  if (!zipCentroids.coordsForZip(incoming.postalCode)) {
    throw new Error(`ZIP ${incoming.postalCode} is not in the ZIP location index, so distance cannot be measured.`);
  }
  const hubs = cur.hubs.filter((h) => h.id !== incoming.id);
  if (!prev && cur.hubs.some((h) => h.id === incoming.id)) {
    throw new Error('A hub with that id already exists.');
  }
  hubs.push(incoming);
  const saved = savePayload({ ...cur, hubs });
  return { saved, hub: saved.hubs.find((h) => h.id === incoming.id) || null };
}

function removeHub(id) {
  const cur = loadHubs({ force: true });
  const key = clean(id, 60);
  const target = cur.hubs.find((h) => h.id === key);
  if (!target) return { saved: cur, removed: 0 };
  const remainingActive = cur.hubs.filter((h) => h.active && h.id !== key);
  if (!remainingActive.length) throw new Error('Keep at least one active hub.');
  const saved = savePayload({ ...cur, hubs: cur.hubs.filter((h) => h.id !== key) });
  return { saved, removed: 1 };
}

function setHubActive(id, active) {
  const cur = loadHubs({ force: true });
  const key = clean(id, 60);
  if (!cur.hubs.some((h) => h.id === key)) return { saved: cur, updated: 0 };
  if (active === false && !cur.hubs.some((h) => h.active && h.id !== key)) {
    throw new Error('Keep at least one active hub.');
  }
  const hubs = cur.hubs.map((h) =>
    h.id === key ? { ...h, active: active !== false, updatedAt: new Date().toISOString() } : h,
  );
  return { saved: savePayload({ ...cur, hubs }), updated: 1 };
}

function setDefaultHub(id) {
  const cur = loadHubs({ force: true });
  const key = clean(id, 60);
  const hit = cur.hubs.find((h) => h.id === key);
  if (!hit) throw new Error('Hub not found.');
  if (!hit.active) throw new Error('Turn the hub on before making it the default.');
  return savePayload({ ...cur, defaultHubId: key });
}

/** Admin check: which hub serves this giftee ZIP, plus distance to every hub. */
function checkZip(postalCode) {
  const zip = normZip(postalCode);
  const pick = nearestHub(zip);
  const distances = loadHubs()
    .hubs.map((h) => {
      const d = zipCentroids.distanceBetweenZipsMiles(zip, h.postalCode);
      return { id: h.id, name: h.name, postalCode: h.postalCode, active: h.active, distanceMiles: d == null ? null : Math.round(d * 10) / 10 };
    })
    .sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity));
  return {
    postalCode: zip,
    knownCentroid: zip.length === 5 && !!zipCentroids.coordsForZip(zip),
    geo: zip.length === 5 ? zipCounty.lookupZip(zip) : null,
    hubId: pick.hub.id,
    hubName: pick.hub.name,
    matched: pick.matched,
    distanceMiles: pick.distanceMiles,
    distances,
  };
}

/** Command Center report: hubs + how many allowed giftee ZIPs each one serves. */
function getAdminReport(allowedZipCodes = []) {
  const data = loadHubs();
  const served = new Map(data.hubs.map((h) => [h.id, 0]));
  const farthest = new Map();
  for (const z of allowedZipCodes) {
    if (!zipWithinActiveHubRadius(z)) continue;
    const pick = nearestHub(z);
    served.set(pick.hub.id, (served.get(pick.hub.id) || 0) + 1);
    if (pick.distanceMiles != null && (farthest.get(pick.hub.id) || 0) < pick.distanceMiles) {
      farthest.set(pick.hub.id, pick.distanceMiles);
    }
  }
  return {
    updatedAt: data.updatedAt,
    defaultHubId: data.defaultHubId,
    kinds: HUB_KINDS,
    allowedZipCount: allowedZipCodes.length,
    hubs: data.hubs.map((h) => ({
      ...h,
      isDefault: h.id === data.defaultHubId,
      shipLines: shipLinesFor(h),
      geo: zipCounty.lookupZip(h.postalCode),
      knownCentroid: !!zipCentroids.coordsForZip(h.postalCode),
      servedAllowedZipCount: h.active ? served.get(h.id) || 0 : 0,
      farthestServedMiles: h.active ? farthest.get(h.id) || 0 : 0,
    })),
  };
}

module.exports = {
  DATA_PATH,
  HUB_SERVICE_RADIUS_MILES,
  HUB_KINDS,
  SEED_HUB,
  normZip,
  normalizeHub,
  loadHubs,
  activeHubs,
  defaultHub,
  publicHub,
  nearestHub,
  publicHubForZip,
  zipWithinActiveHubRadius,
  filterZipsWithinHubRadius,
  isHubAddress,
  upsertHub,
  removeHub,
  setHubActive,
  setDefaultHub,
  checkZip,
  getAdminReport,
};
