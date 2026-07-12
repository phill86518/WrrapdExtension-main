/**
 * Allowed delivery ZIP codes (giftee destination).
 * Stored in data/allowed-zip-codes.json — editable via admin API.
 */
const fs = require('fs');
const path = require('path');
const zipCounty = require('./zip-county');

const DATA_PATH = path.join(__dirname, '..', 'data', 'allowed-zip-codes.json');

let memoryCache = null;
let memoryMtimeMs = 0;

function normZip(z) {
  return String(z || '')
    .replace(/\D/g, '')
    .slice(0, 5);
}

function uniqueSortedZips(list) {
  const set = new Set();
  for (const raw of list || []) {
    const z = normZip(raw);
    if (z.length === 5) set.add(z);
  }
  return [...set].sort();
}

function readFileRaw() {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed?.allowedZipCodes) ? parsed.allowedZipCodes : [];
  return {
    allowedZipCodes: uniqueSortedZips(list),
    updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null,
    notes: typeof parsed?.notes === 'string' ? parsed.notes : null,
  };
}

function loadAllowedZipCodes({ force = false } = {}) {
  try {
    const st = fs.statSync(DATA_PATH);
    if (!force && memoryCache && st.mtimeMs === memoryMtimeMs) {
      return memoryCache;
    }
    memoryCache = readFileRaw();
    memoryMtimeMs = st.mtimeMs;
    return memoryCache;
  } catch (e) {
    console.error('[allowed-zip-codes] load failed', e && e.message ? e.message : e);
    if (memoryCache) return memoryCache;
    return { allowedZipCodes: [], updatedAt: null, notes: null };
  }
}

function saveAllowedZipCodes(zipList, { notes } = {}) {
  const allowedZipCodes = uniqueSortedZips(zipList);
  const payload = {
    updatedAt: new Date().toISOString(),
    notes: notes != null ? String(notes) : loadAllowedZipCodes().notes,
    allowedZipCodes,
  };
  fs.writeFileSync(DATA_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  memoryCache = {
    allowedZipCodes: payload.allowedZipCodes,
    updatedAt: payload.updatedAt,
    notes: payload.notes,
  };
  try {
    memoryMtimeMs = fs.statSync(DATA_PATH).mtimeMs;
  } catch {
    memoryMtimeMs = Date.now();
  }
  return memoryCache;
}

function isZipAllowed(postalCode) {
  const z = normZip(postalCode);
  if (z.length !== 5) return false;
  return loadAllowedZipCodes().allowedZipCodes.includes(z);
}

function addZips(zipList) {
  const current = loadAllowedZipCodes({ force: true }).allowedZipCodes;
  return saveAllowedZipCodes([...current, ...zipList]);
}

function removeZips(zipList) {
  const remove = new Set(uniqueSortedZips(zipList));
  const current = loadAllowedZipCodes({ force: true }).allowedZipCodes;
  return saveAllowedZipCodes(current.filter((z) => !remove.has(z)));
}

/** All ZIPs in the county index for the given states (e.g. FL, GA). */
function listZipsForStates(states) {
  const wanted = new Set(
    (states || []).map((s) => String(s || '').trim().toUpperCase().slice(0, 2)).filter(Boolean),
  );
  if (!wanted.size) return [];
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'zip-county.json'), 'utf8'));
  const out = [];
  for (const [zip, row] of Object.entries(data.byZip || {})) {
    if (row && wanted.has(String(row.state || '').toUpperCase())) out.push(zip);
  }
  return uniqueSortedZips(out);
}

function seedStates(states, { notes } = {}) {
  const zips = listZipsForStates(states);
  return saveAllowedZipCodes(zips, {
    notes:
      notes ||
      `Seeded ${states.join('+')} delivery allowlist (${zips.length} ZIPs) from zip-county index.`,
  });
}

function checkZip(postalCode) {
  const z = normZip(postalCode);
  const allowed = z.length === 5 && isZipAllowed(z);
  const geo = z.length === 5 ? zipCounty.lookupZip(z) : null;
  return { postalCode: z, allowed, geo };
}

module.exports = {
  DATA_PATH,
  normZip,
  loadAllowedZipCodes,
  saveAllowedZipCodes,
  isZipAllowed,
  addZips,
  removeZips,
  listZipsForStates,
  seedStates,
  checkZip,
  uniqueSortedZips,
};
