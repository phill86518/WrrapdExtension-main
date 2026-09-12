/**
 * Custom-design (printed wrapping paper) coverage.
 *
 * A "printer site" is an approved WrapStar (or a manual entry) who owns a large-format
 * printer, keyed by the ZIP where the printer sits. Every giftee ZIP whose centroid is
 * within `radiusMiles` (default 15) of an ACTIVE printer site can be offered
 * "Upload my own design" / "Generate a design with AI" in the Wrrapd gift modal.
 *
 * Stored in data/printer-sites.json — edited through the admin API (Command Center →
 * Custom-design coverage) and pushed from the tracking platform's WrapStar roster.
 */
const fs = require('fs');
const path = require('path');
const zipCentroids = require('./zip-centroids');
const zipCounty = require('./zip-county');

const DATA_PATH = path.join(__dirname, '..', 'data', 'printer-sites.json');
const DEFAULT_RADIUS_MILES = 15;
const MIN_RADIUS_MILES = 1;
const MAX_RADIUS_MILES = 60;

/** Matches WordPress `wrrapd_wrapstars_printer_size_options()`. */
const PRINTER_SIZE_LABELS = Object.freeze({
  under24: 'Under 24 inches',
  24: '24 inches',
  36: '36 inches',
  '44plus': '44 inches or larger',
});

let memoryCache = null;
let memoryMtimeMs = 0;
let coverageCache = null; // { key, coveredZips:Set, byZip:Map }

function normZip(z) {
  return String(z || '')
    .replace(/\D/g, '')
    .slice(0, 5);
}

function clampRadius(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_RADIUS_MILES;
  return Math.min(MAX_RADIUS_MILES, Math.max(MIN_RADIUS_MILES, Math.round(v * 10) / 10));
}

function printerLabelFor(size) {
  const key = String(size || '').trim();
  if (!key) return '';
  return PRINTER_SIZE_LABELS[key] || key;
}

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function normalizeSite(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const postalCode = normZip(raw.postalCode || raw.zip);
  if (postalCode.length !== 5) return null;
  const name = String(raw.name || '').trim();
  const wrapstarId = raw.wrapstarId != null ? String(raw.wrapstarId).trim() : '';
  const source = raw.source === 'manual' ? 'manual' : 'roster';
  let id = raw.id != null ? String(raw.id).trim() : '';
  if (!id) {
    id = wrapstarId ? `ws-${wrapstarId}` : `manual-${postalCode}-${slug(name) || 'site'}`;
  }
  const printerSize = String(raw.printerSize || '').trim();
  const printerModel = String(raw.printerModel || '').trim().slice(0, 120);
  return {
    id,
    wrapstarId: wrapstarId || null,
    name: name || (wrapstarId ? `WrapStar ${wrapstarId}` : 'Printer site'),
    postalCode,
    printerSize,
    printerModel,
    printerLabel: String(raw.printerLabel || '').trim() || printerLabelFor(printerSize),
    active: raw.active !== false,
    source,
    notes: raw.notes != null ? String(raw.notes).slice(0, 500) : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}

function normalizePayload(parsed) {
  const sitesRaw = Array.isArray(parsed && parsed.sites) ? parsed.sites : [];
  const seen = new Set();
  const sites = [];
  for (const raw of sitesRaw) {
    const s = normalizeSite(raw);
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    sites.push(s);
  }
  sites.sort((a, b) => (a.postalCode < b.postalCode ? -1 : a.postalCode > b.postalCode ? 1 : a.name.localeCompare(b.name)));
  return {
    radiusMiles: clampRadius(parsed && parsed.radiusMiles),
    updatedAt: typeof (parsed && parsed.updatedAt) === 'string' ? parsed.updatedAt : null,
    notes: typeof (parsed && parsed.notes) === 'string' ? parsed.notes : null,
    sites,
  };
}

function readFileRaw() {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  return normalizePayload(JSON.parse(raw));
}

function loadSites({ force = false } = {}) {
  try {
    const st = fs.statSync(DATA_PATH);
    if (!force && memoryCache && st.mtimeMs === memoryMtimeMs) return memoryCache;
    memoryCache = readFileRaw();
    memoryMtimeMs = st.mtimeMs;
    return memoryCache;
  } catch (e) {
    if (e && e.code !== 'ENOENT') {
      console.error('[printer-coverage] load failed', e && e.message ? e.message : e);
    }
    if (memoryCache) return memoryCache;
    memoryCache = { radiusMiles: DEFAULT_RADIUS_MILES, updatedAt: null, notes: null, sites: [] };
    return memoryCache;
  }
}

function savePayload(next) {
  const payload = normalizePayload({ ...next, updatedAt: new Date().toISOString() });
  payload.updatedAt = new Date().toISOString();
  fs.writeFileSync(DATA_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  memoryCache = payload;
  try {
    memoryMtimeMs = fs.statSync(DATA_PATH).mtimeMs;
  } catch {
    memoryMtimeMs = Date.now();
  }
  coverageCache = null;
  return memoryCache;
}

function listSites() {
  return loadSites().sites.slice();
}

function getRadiusMiles() {
  return loadSites().radiusMiles;
}

function setRadiusMiles(radiusMiles, { notes } = {}) {
  const cur = loadSites({ force: true });
  return savePayload({ ...cur, radiusMiles: clampRadius(radiusMiles), notes: notes != null ? String(notes) : cur.notes });
}

/** Add or update one site (matched by id, else by wrapstarId, else by ZIP+name for manual). */
function upsertSite(input) {
  const cur = loadSites({ force: true });
  const incoming = normalizeSite({ ...input, updatedAt: new Date().toISOString() });
  if (!incoming) throw new Error('A valid 5-digit ZIP is required for a printer site.');
  const sites = cur.sites.slice();
  let idx = sites.findIndex((s) => s.id === incoming.id);
  if (idx < 0 && incoming.wrapstarId) {
    idx = sites.findIndex((s) => s.wrapstarId && s.wrapstarId === incoming.wrapstarId);
  }
  if (idx >= 0) {
    const prev = sites[idx];
    sites[idx] = {
      ...prev,
      ...incoming,
      id: prev.id,
      notes: input.notes != null ? incoming.notes : prev.notes,
      active: input.active != null ? incoming.active : prev.active,
    };
  } else {
    sites.push(incoming);
  }
  const saved = savePayload({ ...cur, sites });
  return { saved, site: saved.sites.find((s) => s.id === (idx >= 0 ? sites[idx].id : incoming.id)) || null };
}

function removeSite(id) {
  const cur = loadSites({ force: true });
  const key = String(id || '').trim();
  const sites = cur.sites.filter((s) => s.id !== key && !(s.wrapstarId && s.wrapstarId === key));
  const removed = cur.sites.length - sites.length;
  return { saved: savePayload({ ...cur, sites }), removed };
}

function setSiteActive(id, active) {
  const cur = loadSites({ force: true });
  const key = String(id || '').trim();
  let hit = false;
  const sites = cur.sites.map((s) => {
    if (s.id === key || (s.wrapstarId && s.wrapstarId === key)) {
      hit = true;
      return { ...s, active: active !== false, updatedAt: new Date().toISOString() };
    }
    return s;
  });
  if (!hit) return { saved: cur, updated: 0 };
  return { saved: savePayload({ ...cur, sites }), updated: 1 };
}

/**
 * Replace every `source: 'roster'` site with the given roster list (from the tracking
 * platform's approved WrapStars with printers). Manual sites are preserved.
 */
function replaceRosterSites(rosterSites, { notes } = {}) {
  const cur = loadSites({ force: true });
  const manual = cur.sites.filter((s) => s.source === 'manual');
  const prevRoster = new Map(cur.sites.filter((s) => s.source === 'roster').map((s) => [s.id, s]));
  const roster = [];
  for (const raw of Array.isArray(rosterSites) ? rosterSites : []) {
    const s = normalizeSite({ ...raw, source: 'roster' });
    if (!s) continue;
    const prev = prevRoster.get(s.id);
    // Keep an admin's manual deactivation across syncs unless the sync says otherwise explicitly.
    if (prev && raw.active == null) s.active = prev.active;
    if (prev && !raw.notes) s.notes = prev.notes;
    roster.push(s);
  }
  return savePayload({ ...cur, sites: [...manual, ...roster], notes: notes != null ? String(notes) : cur.notes });
}

/** Active sites → coverage map. Memoized until the data file changes. */
function getCoverage() {
  const data = loadSites();
  const key = `${memoryMtimeMs}|${data.radiusMiles}|${data.sites.length}`;
  if (coverageCache && coverageCache.key === key) return coverageCache;
  const byZip = new Map(); // zip -> [{ siteId, distanceMiles }]
  const bySite = new Map(); // siteId -> [{ zip, distanceMiles }]
  for (const site of data.sites) {
    if (!site.active) continue;
    const covered = zipCentroids.zipsWithinRadius(site.postalCode, data.radiusMiles);
    bySite.set(site.id, covered);
    for (const { zip, distanceMiles } of covered) {
      if (!byZip.has(zip)) byZip.set(zip, []);
      byZip.get(zip).push({ siteId: site.id, distanceMiles });
    }
  }
  for (const list of byZip.values()) list.sort((a, b) => a.distanceMiles - b.distanceMiles);
  coverageCache = { key, radiusMiles: data.radiusMiles, byZip, bySite, coveredZips: new Set(byZip.keys()) };
  return coverageCache;
}

/** Shopper-facing question: can this giftee ZIP get custom-printed paper? */
function isCustomDesignAvailable(postalCode) {
  const zip = normZip(postalCode);
  if (zip.length !== 5) return false;
  return getCoverage().coveredZips.has(zip);
}

/** Public-safe payload for the extension / checkout (no WrapStar identities). */
function publicAvailability(postalCode) {
  const zip = normZip(postalCode);
  const cov = getCoverage();
  const available = zip.length === 5 && cov.coveredZips.has(zip);
  return { postalCode: zip, available, radiusMiles: cov.radiusMiles };
}

/** Admin check: which printer sites cover this ZIP (nearest first). */
function checkZip(postalCode) {
  const zip = normZip(postalCode);
  const data = loadSites();
  const cov = getCoverage();
  const hits = zip.length === 5 ? cov.byZip.get(zip) || [] : [];
  const siteById = new Map(data.sites.map((s) => [s.id, s]));
  const sites = hits
    .map((h) => {
      const s = siteById.get(h.siteId);
      if (!s) return null;
      return {
        id: s.id,
        wrapstarId: s.wrapstarId,
        name: s.name,
        postalCode: s.postalCode,
        printerSize: s.printerSize,
        printerModel: s.printerModel,
        printerLabel: s.printerLabel,
        distanceMiles: h.distanceMiles,
      };
    })
    .filter(Boolean);
  // Nearest printer even when out of range (helps ops decide where to recruit).
  let nearest = null;
  if (zip.length === 5 && !sites.length) {
    for (const s of data.sites) {
      if (!s.active) continue;
      const d = zipCentroids.distanceBetweenZipsMiles(zip, s.postalCode);
      if (d == null) continue;
      if (!nearest || d < nearest.distanceMiles) {
        nearest = { id: s.id, name: s.name, postalCode: s.postalCode, printerModel: s.printerModel, printerLabel: s.printerLabel, distanceMiles: Math.round(d * 10) / 10 };
      }
    }
  }
  return {
    postalCode: zip,
    available: sites.length > 0,
    radiusMiles: cov.radiusMiles,
    sites,
    nearestOutOfRange: nearest,
    geo: zip.length === 5 ? zipCounty.lookupZip(zip) : null,
    knownCentroid: zip.length === 5 ? !!zipCentroids.coordsForZip(zip) : false,
  };
}

/** Full report for the Command Center dashboard. */
function getAdminReport() {
  const data = loadSites();
  const cov = getCoverage();
  const sites = data.sites.map((s) => {
    const covered = cov.bySite.get(s.id) || [];
    const geo = zipCounty.lookupZip(s.postalCode);
    return {
      ...s,
      geo,
      knownCentroid: !!zipCentroids.coordsForZip(s.postalCode),
      coveredZipCount: covered.length,
      coveredZips: covered.map((c) => {
        const g = zipCounty.lookupZip(c.zip);
        return { zip: c.zip, distanceMiles: c.distanceMiles, county: g ? g.county : null, state: g ? g.state : null };
      }),
    };
  });
  // Distinct ZIPs where a printer physically sits (one chip per ZIP; may host several WrapStars).
  const printerZipMap = new Map();
  for (const s of data.sites) {
    if (!printerZipMap.has(s.postalCode)) {
      printerZipMap.set(s.postalCode, { postalCode: s.postalCode, geo: zipCounty.lookupZip(s.postalCode), siteIds: [], activeCount: 0 });
    }
    const row = printerZipMap.get(s.postalCode);
    row.siteIds.push(s.id);
    if (s.active) row.activeCount += 1;
  }
  const printerZips = [...printerZipMap.values()].sort((a, b) => (a.postalCode < b.postalCode ? -1 : 1));
  const coveredZips = [...cov.coveredZips].sort();
  return {
    radiusMiles: data.radiusMiles,
    updatedAt: data.updatedAt,
    notes: data.notes,
    siteCount: data.sites.length,
    activeSiteCount: data.sites.filter((s) => s.active).length,
    coveredZipCount: coveredZips.length,
    coveredZips,
    printerZips,
    sites,
    printerSizeLabels: PRINTER_SIZE_LABELS,
    centroids: zipCentroids.getMeta(),
  };
}

module.exports = {
  DATA_PATH,
  DEFAULT_RADIUS_MILES,
  PRINTER_SIZE_LABELS,
  normZip,
  printerLabelFor,
  loadSites,
  listSites,
  getRadiusMiles,
  setRadiusMiles,
  upsertSite,
  removeSite,
  setSiteActive,
  replaceRosterSites,
  getCoverage,
  isCustomDesignAvailable,
  publicAvailability,
  checkZip,
  getAdminReport,
};
