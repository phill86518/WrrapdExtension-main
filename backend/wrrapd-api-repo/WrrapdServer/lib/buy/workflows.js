/**
 * Saved quote workflows, one per retailer, with full version history (Rye-style: replay the
 * saved steps first; when a step breaks, Grok finds the new control and a new version is saved).
 * Steps may only open pages, choose options, add to cart, open checkout, pick the ship-to hub,
 * read the cost page, and empty the cart. No step may place or pay for an order.
 */
const fs = require('fs');
const path = require('path');
const retailers = require('./retailers');

const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'buy-workflows.json');
const ACTIONS = new Set(['goto', 'click', 'fill', 'select', 'waitFor', 'readCostPage', 'emptyCart']);
const PURPOSES = new Set([
    'open_product',
    'choose_variant',
    'add_to_cart',
    'open_cart',
    'open_checkout',
    'choose_ship_to_hub',
    'reveal_shipping_options',
    'read_cost_page',
    'empty_cart',
]);
const HISTORY_LIMIT = 40;

const SEED_STEPS = [
    { action: 'goto', purpose: 'open_product', value: '{{item.url}}' },
    { action: 'select', purpose: 'choose_variant', value: '{{item.variantLabel}}', optional: true },
    { action: 'click', purpose: 'add_to_cart', target: { text: 'Add to cart' } },
    { action: 'click', purpose: 'open_cart', target: { text: 'Cart' } },
    { action: 'click', purpose: 'open_checkout', target: { text: 'Checkout' } },
    { action: 'click', purpose: 'choose_ship_to_hub', target: { text: '{{hub.addressLine1}}' } },
    { action: 'waitFor', purpose: 'reveal_shipping_options', target: { text: 'Shipping' }, optional: true },
    { action: 'readCostPage', purpose: 'read_cost_page' },
    { action: 'emptyCart', purpose: 'empty_cart' },
];

let cache = null;

function cleanStep(s) {
    if (!s || typeof s !== 'object') return null;
    const action = String(s.action || '');
    const purpose = String(s.purpose || '');
    if (!ACTIONS.has(action) || !PURPOSES.has(purpose)) return null;
    const target = s.target && typeof s.target === 'object' ? s.target : null;
    return {
        action,
        purpose,
        ...(target
            ? {
                  target: {
                      ...(target.selector ? { selector: String(target.selector).slice(0, 400) } : {}),
                      ...(target.text ? { text: String(target.text).slice(0, 120) } : {}),
                      ...(target.role ? { role: String(target.role).slice(0, 40) } : {}),
                  },
              }
            : {}),
        ...(s.value != null ? { value: String(s.value).slice(0, 400) } : {}),
        ...(s.optional === true ? { optional: true } : {}),
    };
}

function cleanSteps(steps) {
    if (!Array.isArray(steps)) return null;
    const out = steps.slice(0, 40).map(cleanStep);
    if (out.some((s) => !s)) return null;
    if (!out.some((s) => s.action === 'readCostPage')) return null;
    return out;
}

function seedFor(retailerId) {
    return {
        version: 1,
        steps: SEED_STEPS.map((s) => ({ ...s, ...(s.target ? { target: { ...s.target } } : {}) })),
        source: 'seed',
        note: 'Starting outline. Confirm each control on the live site before turning on automated quotes.',
        savedAt: new Date(0).toISOString(),
        savedBy: 'system',
        verified: false,
        successCount: 0,
        failCount: 0,
        lastSuccessAt: null,
        lastFailure: null,
        retailer: retailerId,
    };
}

function load({ force } = {}) {
    if (cache && !force) return cache;
    let raw = {};
    try {
        raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    } catch (_) {
        raw = {};
    }
    const out = {};
    for (const id of retailers.ALL_IDS) {
        const rec = raw[id] && typeof raw[id] === 'object' ? raw[id] : {};
        out[id] = {
            current: rec.current && cleanSteps(rec.current.steps) ? rec.current : seedFor(id),
            history: Array.isArray(rec.history) ? rec.history.slice(-HISTORY_LIMIT) : [],
            runs: Array.isArray(rec.runs) ? rec.runs.slice(-60) : [],
        };
    }
    cache = out;
    return out;
}

function persist(all) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    const tmp = `${DATA_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(all, null, 2));
    fs.renameSync(tmp, DATA_PATH);
    cache = all;
}

function get(retailerId) {
    return load()[retailerId] || null;
}

/** Saves a new current version; the old one moves to history. */
function saveVersion(retailerId, steps, { source, savedBy, note, verified } = {}) {
    const cleaned = cleanSteps(steps);
    if (!cleaned) return { ok: false, error: 'Steps are not valid. Each step needs an allowed action and purpose, and one step must read the cost page.' };
    const all = load({ force: true });
    const rec = all[retailerId];
    if (!rec) return { ok: false, error: 'Unknown retailer' };
    const prev = rec.current;
    rec.history.push({ ...prev, retiredAt: new Date().toISOString() });
    rec.history = rec.history.slice(-HISTORY_LIMIT);
    rec.current = {
        version: Math.max(prev.version || 0, ...rec.history.map((h) => h.version || 0)) + 1,
        steps: cleaned,
        source: String(source || 'admin').slice(0, 40),
        note: String(note || '').slice(0, 400),
        savedAt: new Date().toISOString(),
        savedBy: String(savedBy || 'admin').slice(0, 80),
        verified: verified === true,
        successCount: 0,
        failCount: 0,
        lastSuccessAt: null,
        lastFailure: null,
        retailer: retailerId,
    };
    persist(all);
    return { ok: true, current: rec.current };
}

function restore(retailerId, version, savedBy) {
    const rec = get(retailerId);
    if (!rec) return { ok: false, error: 'Unknown retailer' };
    const hit = rec.history.find((h) => Number(h.version) === Number(version));
    if (!hit) return { ok: false, error: 'That version is not in the history.' };
    return saveVersion(retailerId, hit.steps, {
        source: 'restore',
        savedBy,
        note: `Restored from version ${hit.version}`,
        verified: hit.verified === true,
    });
}

function recordRun(retailerId, { ok, batchId, failedStep, reason, healed }) {
    const all = load({ force: true });
    const rec = all[retailerId];
    if (!rec) return;
    const now = new Date().toISOString();
    if (ok) {
        rec.current.successCount = (rec.current.successCount || 0) + 1;
        rec.current.lastSuccessAt = now;
    } else {
        rec.current.failCount = (rec.current.failCount || 0) + 1;
        rec.current.lastFailure = { at: now, step: failedStep ?? null, reason: String(reason || '').slice(0, 300) };
    }
    rec.runs.push({
        at: now,
        ok: !!ok,
        version: rec.current.version,
        batchId: batchId || null,
        healed: !!healed,
        ...(ok ? {} : { step: failedStep ?? null, reason: String(reason || '').slice(0, 300) }),
    });
    rec.runs = rec.runs.slice(-60);
    persist(all);
}

function adminView() {
    const all = load();
    return retailers.RETAILERS.map((r) => ({
        retailer: r.id,
        name: r.name,
        current: all[r.id].current,
        history: all[r.id].history.map((h) => ({
            version: h.version,
            source: h.source,
            note: h.note,
            savedAt: h.savedAt,
            savedBy: h.savedBy,
            retiredAt: h.retiredAt,
            verified: h.verified === true,
            successCount: h.successCount || 0,
            failCount: h.failCount || 0,
            stepCount: Array.isArray(h.steps) ? h.steps.length : 0,
        })),
        runs: all[r.id].runs.slice(-20).reverse(),
    }));
}

module.exports = { get, load, saveVersion, restore, recordRun, adminView, cleanSteps, ACTIONS, PURPOSES };
