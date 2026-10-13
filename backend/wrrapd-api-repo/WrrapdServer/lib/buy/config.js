/**
 * "We buy it for you" settings. Saved by Command Center → We buy it → Settings.
 * The return window is fixed at 15 days by the Terms and is not editable here.
 */
const fs = require('fs');
const path = require('path');
const retailers = require('./retailers');

const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'buy-for-you-config.json');
const RETURN_WINDOW_DAYS = 15;

const DEFAULTS = Object.freeze({
    mode: 'off',
    previewCode: '',
    maxLinks: 5,
    merchandiseCapCents: 30000,
    perItemCapCents: 30000,
    quoteWaitMinutes: 20,
    allowElectronics: true,
    allowedRetailers: retailers.ALL_IDS.slice(),
    automatedQuoteRetailers: [],
    teamAlertEmails: ['admin@wrrapd.com'],
});

let cache = null;

function intIn(v, lo, hi, dflt) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return dflt;
    return Math.max(lo, Math.min(hi, n));
}

function normalize(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const mode = ['off', 'test', 'live'].includes(src.mode) ? src.mode : DEFAULTS.mode;
    const ids = (list) =>
        Array.isArray(list) ? [...new Set(list.map(String).filter((id) => retailers.ALL_IDS.includes(id)))] : null;
    const emails = Array.isArray(src.teamAlertEmails)
        ? src.teamAlertEmails.map((e) => String(e).trim()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)).slice(0, 8)
        : DEFAULTS.teamAlertEmails.slice();
    const cap = intIn(src.merchandiseCapCents, 100, 30000, DEFAULTS.merchandiseCapCents);
    return {
        mode,
        previewCode: String(src.previewCode || '').trim().slice(0, 40),
        maxLinks: intIn(src.maxLinks, 1, 5, DEFAULTS.maxLinks),
        merchandiseCapCents: cap,
        perItemCapCents: Math.min(cap, intIn(src.perItemCapCents, 100, 30000, DEFAULTS.perItemCapCents)),
        quoteWaitMinutes: intIn(src.quoteWaitMinutes, 5, 240, DEFAULTS.quoteWaitMinutes),
        allowElectronics: src.allowElectronics !== false,
        allowedRetailers: ids(src.allowedRetailers) ?? DEFAULTS.allowedRetailers.slice(),
        automatedQuoteRetailers: ids(src.automatedQuoteRetailers) ?? [],
        teamAlertEmails: emails.length ? emails : DEFAULTS.teamAlertEmails.slice(),
        returnWindowDays: RETURN_WINDOW_DAYS,
        updatedAt: src.updatedAt || null,
        updatedBy: src.updatedBy || null,
    };
}

function load({ force } = {}) {
    if (cache && !force) return cache;
    try {
        cache = normalize(JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')));
    } catch (_) {
        cache = normalize({});
    }
    return cache;
}

function save(input, updatedBy) {
    const next = normalize({
        ...load({ force: true }),
        ...(input && typeof input === 'object' ? input : {}),
        updatedAt: new Date().toISOString(),
        updatedBy: String(updatedBy || 'admin').slice(0, 80),
    });
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    const tmp = `${DATA_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, DATA_PATH);
    cache = next;
    return next;
}

/** Whether a shopper may use the page. Test mode needs the preview code. */
function openFor(previewCode) {
    const c = load();
    if (c.mode === 'live') return true;
    if (c.mode === 'test') return !!c.previewCode && String(previewCode || '').trim() === c.previewCode;
    return false;
}

function publicConfig(previewCode) {
    const c = load();
    return {
        open: openFor(previewCode),
        mode: c.mode === 'live' ? 'live' : c.mode === 'test' ? 'test' : 'off',
        maxLinks: c.maxLinks,
        merchandiseCapCents: c.merchandiseCapCents,
        perItemCapCents: c.perItemCapCents,
        returnWindowDays: RETURN_WINDOW_DAYS,
        retailers: retailers.publicList(c.allowedRetailers),
    };
}

module.exports = { load, save, openFor, publicConfig, RETURN_WINDOW_DAYS, DATA_PATH };
