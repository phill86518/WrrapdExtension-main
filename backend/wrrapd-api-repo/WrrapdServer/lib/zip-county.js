/**
 * US ZIP5 → county lookup (Census ZCTA–county relationship).
 * Data: ../data/zip-county.json
 */
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'zip-county.json');

let cached = null;

function load() {
  if (cached) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (e) {
    console.error('[zip-county] failed to load', e.message);
    cached = { byZip: {}, countiesByState: {}, zipsByCounty: {} };
  }
  return cached;
}

function normZip(z) {
  return String(z || '')
    .replace(/\D/g, '')
    .slice(0, 5);
}

function normCounty(name) {
  return String(name || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\s+COUNTY$/i, '')
    .replace(/\s+PARISH$/i, '')
    .trim();
}

function normState(s) {
  return String(s || '')
    .trim()
    .toUpperCase()
    .slice(0, 2);
}

function lookupZip(postalCode) {
  const zip = normZip(postalCode);
  if (zip.length !== 5) return null;
  const row = load().byZip[zip];
  if (!row) return null;
  return { zip, state: row.state, county: row.county };
}

function countyKey(state, county) {
  return `${normState(state)}|${normCounty(county)}`;
}

function listStates() {
  return Object.keys(load().countiesByState || {}).sort();
}

function listCounties(state) {
  const st = normState(state);
  return (load().countiesByState[st] || []).slice();
}

function listZipsForCounty(state, county) {
  const key = countyKey(state, county);
  return (load().zipsByCounty[key] || []).slice();
}

/** Compact index for admin UI (no per-ZIP map). */
function getAdminIndex() {
  const data = load();
  return {
    version: data.version || null,
    source: data.source || null,
    zipCount: data.zipCount || Object.keys(data.byZip || {}).length,
    countiesByState: data.countiesByState || {},
  };
}

module.exports = {
  lookupZip,
  listStates,
  listCounties,
  listZipsForCounty,
  getAdminIndex,
  countyKey,
  normCounty,
  normState,
  normZip,
};
