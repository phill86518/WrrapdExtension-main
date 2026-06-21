/**
 * Dynamic Wrrapd unit pricing (geo hints, calendar surges, global multiplier, per-retailer overrides).
 * Priority: data/wrrapd-pricing-config.json → env WRRAPD_PRICE_CONFIG_JSON → built-in defaults.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_UNIT = Object.freeze({
    giftWrapBase: 6.99,
    customDesignAi: 2.99,
    customDesignUpload: 1.99,
    flowers: 17.99,
});

const DEFAULT_CONFIG = Object.freeze({
    version: 'default',
    defaultUnitPrices: { ...DEFAULT_UNIT },
    globalMultiplier: 1,
    rules: [],
    retailers: {},
});

const PRICING_CONFIG_PATH = path.join(__dirname, '..', 'data', 'wrrapd-pricing-config.json');

let cachedConfig = null;
let cachedConfigSignature = '';

const salesTaxZip = require('./sales-tax-zip');

/** Wrrapd hub ZIP (Duval County FL) — default sales-tax jurisdiction for extension checkouts. */
const HUB_TAX_ZIP5 = '32226';
const HUB_DEFAULT_TAX_PERCENT = 7.5;

function normalizeRetailerSlug(retailer) {
    if (retailer == null) return '';
    return String(retailer)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 32);
}

function normalizeUnitPricesObject(raw) {
    const base = raw && typeof raw === 'object' ? raw : {};
    return {
        giftWrapBase: numOr(base.giftWrapBase, DEFAULT_UNIT.giftWrapBase),
        customDesignAi: numOr(base.customDesignAi, DEFAULT_UNIT.customDesignAi),
        customDesignUpload: numOr(base.customDesignUpload, DEFAULT_UNIT.customDesignUpload),
        flowers: numOr(base.flowers, DEFAULT_UNIT.flowers),
    };
}

function normalizeRetailersMap(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [key, val] of Object.entries(raw)) {
        const slug = normalizeRetailerSlug(key);
        if (!slug || !val || typeof val !== 'object') continue;
        out[slug] = normalizeUnitPricesObject(val);
    }
    return out;
}

function normalizePricingConfig(parsed) {
    const src = parsed && typeof parsed === 'object' ? parsed : {};
    const defaultUnitPrices = normalizeUnitPricesObject(src.defaultUnitPrices);
    const globalMultiplier = clampMult(src.globalMultiplier, 1);
    const rules = Array.isArray(src.rules) ? src.rules.slice(0, 64) : [];
    const retailers = normalizeRetailersMap(src.retailers);
    return {
        version: typeof src.version === 'string' ? src.version.slice(0, 64) : 'custom',
        defaultUnitPrices,
        globalMultiplier,
        rules,
        retailers,
    };
}

function readPricingConfigFileRaw() {
    try {
        return fs.readFileSync(PRICING_CONFIG_PATH, 'utf8');
    } catch (_) {
        return '';
    }
}

function loadPricingConfig() {
    const fileRaw = readPricingConfigFileRaw();
    const envRaw = (process.env.WRRAPD_PRICE_CONFIG_JSON || '').trim();
    const signature = `${fileRaw.length}:${fileRaw.slice(0, 64)}|${envRaw.length}:${envRaw.slice(0, 64)}`;
    if (signature === cachedConfigSignature && cachedConfig) return cachedConfig;

    let parsed = null;
    if (fileRaw.trim()) {
        try {
            parsed = JSON.parse(fileRaw);
        } catch (e) {
            console.error('[wrrapd-pricing] Invalid data/wrrapd-pricing-config.json:', e.message);
        }
    }
    if (!parsed && envRaw) {
        try {
            parsed = JSON.parse(envRaw);
        } catch (e) {
            console.error('[wrrapd-pricing] Invalid WRRAPD_PRICE_CONFIG_JSON:', e.message);
        }
    }

    cachedConfig = parsed ? normalizePricingConfig(parsed) : { ...DEFAULT_CONFIG, defaultUnitPrices: { ...DEFAULT_UNIT }, retailers: {} };
    cachedConfigSignature = signature;
    return cachedConfig;
}

/** @deprecated internal alias */
function parseConfigFromEnv() {
    return loadPricingConfig();
}

function numOr(v, d) {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!Number.isFinite(n) || n < 0 || n > 99999) return d;
    return Math.round(n * 1000) / 1000;
}

function clampMult(v, d) {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!Number.isFinite(n) || n <= 0 || n > 10) return d;
    return Math.round(n * 1000) / 1000;
}

function normZip(z) {
    if (z == null) return '';
    const s = String(z).trim().replace(/\s+/g, '');
    const digits = s.replace(/[^0-9]/g, '');
    return digits.slice(0, 10);
}

function normState(s) {
    if (s == null) return '';
    return String(s).trim().toUpperCase().slice(0, 8);
}

function normCountry(c) {
    if (c == null) return '';
    return String(c).trim().toUpperCase().slice(0, 4);
}

/** Month-day in a named IANA zone as integer MMDD for simple range checks (US holiday logic). */
function monthDayInTimeZone(date, timeZone) {
    try {
        const fmt = new Intl.DateTimeFormat('en-US', {
            timeZone: timeZone || 'America/New_York',
            month: '2-digit',
            day: '2-digit',
        });
        const parts = fmt.formatToParts(date);
        const mo = parts.find((p) => p.type === 'month');
        const da = parts.find((p) => p.type === 'day');
        if (!mo || !da) return null;
        const m = parseInt(mo.value, 10);
        const d = parseInt(da.value, 10);
        if (!Number.isFinite(m) || !Number.isFinite(d)) return null;
        return m * 100 + d;
    } catch (_) {
        return null;
    }
}

/** Parse "MM-DD" → MMDD integer */
function parseMonthDayToken(tok) {
    if (typeof tok !== 'string') return null;
    const m = tok.trim().match(/^(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    const mo = parseInt(m[1], 10);
    const da = parseInt(m[2], 10);
    if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    return mo * 100 + da;
}

/**
 * Inclusive range on circular calendar: if start <= end (e.g. 1124–1226), match md in [start,end].
 * If start > end (e.g. 1201–0105), match md >= start OR md <= end.
 */
function monthDayInRange(md, startMd, endMd) {
    if (md == null || startMd == null || endMd == null) return false;
    if (startMd <= endMd) return md >= startMd && md <= endMd;
    return md >= startMd || md <= endMd;
}

function ruleMatchesWhen(when, ctx) {
    if (!when || typeof when !== 'object') return true;
    const zip = ctx.postalCodeNorm;
    const st = ctx.stateNorm;
    const cc = ctx.countryNorm;
    if (Array.isArray(when.postalCodePrefixes) && when.postalCodePrefixes.length) {
        const ok = when.postalCodePrefixes.some((pfx) => {
            const p = String(pfx || '').replace(/[^0-9]/g, '');
            return p && zip.startsWith(p);
        });
        if (!ok) return false;
    }
    if (Array.isArray(when.states) && when.states.length) {
        const set = new Set(when.states.map((x) => normState(x)).filter(Boolean));
        if (!st || !set.has(st)) return false;
    }
    if (Array.isArray(when.countries) && when.countries.length) {
        const set = new Set(when.countries.map((x) => normCountry(x)).filter(Boolean));
        if (!cc || !set.has(cc)) return false;
    }
    if (Array.isArray(when.dateRanges) && when.dateRanges.length) {
        const md = monthDayInTimeZone(ctx.now, ctx.timeZone);
        if (md == null) return false;
        const any = when.dateRanges.some((r) => {
            if (!r || typeof r !== 'object') return false;
            const s = parseMonthDayToken(r.start);
            const e = parseMonthDayToken(r.end);
            if (s == null || e == null) return false;
            return monthDayInRange(md, s, e);
        });
        if (!any) return false;
    }
    return true;
}

function applyMultiplierToPrices(prices, mult) {
    const m = clampMult(mult, 1);
    if (m === 1) return { ...prices };
    const out = {};
    for (const k of Object.keys(prices)) {
        out[k] = Math.round(prices[k] * m * 100) / 100;
    }
    return out;
}

function mergeOverrides(base, ov) {
    if (!ov || typeof ov !== 'object') return base;
    const out = { ...base };
    for (const key of ['giftWrapBase', 'customDesignAi', 'customDesignUpload', 'flowers']) {
        if (ov[key] != null && Number.isFinite(Number(ov[key]))) {
            out[key] = Math.round(Number(ov[key]) * 100) / 100;
        }
    }
    return out;
}

/**
 * @param {{ postalCode?: string, state?: string, country?: string, now?: Date }} geo
 * @param {string} [retailer] e.g. "lego", "etsy"
 */
function resolveWrrapdUnitPrices(geo, retailer) {
    const cfg = loadPricingConfig();
    const timeZone = (process.env.WRRAPD_PRICING_TIMEZONE || 'America/New_York').trim() || 'America/New_York';
    const now = geo && geo.now instanceof Date ? geo.now : new Date();
    const ctx = {
        now,
        timeZone,
        postalCodeNorm: normZip(geo && geo.postalCode),
        stateNorm: normState(geo && geo.state),
        countryNorm: normCountry(geo && geo.country),
    };
    let prices = { ...cfg.defaultUnitPrices };
    const retailerSlug = normalizeRetailerSlug(retailer);
    if (retailerSlug && cfg.retailers && cfg.retailers[retailerSlug]) {
        prices = mergeOverrides(prices, cfg.retailers[retailerSlug]);
    }
    const appliedRuleIds = [];
    for (const rule of cfg.rules) {
        if (!rule || typeof rule !== 'object') continue;
        const id = typeof rule.id === 'string' ? rule.id.slice(0, 64) : '';
        if (!ruleMatchesWhen(rule.when, ctx)) continue;
        if (rule.multiplier != null) {
            prices = applyMultiplierToPrices(prices, rule.multiplier);
        }
        if (rule.unitPrices && typeof rule.unitPrices === 'object') {
            prices = mergeOverrides(prices, rule.unitPrices);
        }
        if (id) appliedRuleIds.push(id);
    }
    if (cfg.globalMultiplier && cfg.globalMultiplier !== 1) {
        prices = applyMultiplierToPrices(prices, cfg.globalMultiplier);
    }
    return {
        unitPrices: prices,
        configVersion: cfg.version,
        appliedRuleIds,
        timeZone,
        retailer: retailerSlug || null,
    };
}

/**
 * @param {Array<{ options?: Array<{ checkbox_wrrapd?: boolean, selected_wrapping_option?: string, checkbox_flowers?: boolean }> }>} items
 * @param {{ giftWrapBase: number, customDesignAi: number, customDesignUpload: number, flowers: number }} unitPrices
 */
function computeSubtotalFromPricingCartItems(items, unitPrices) {
    const p = unitPrices;
    let giftWrapTotal = 0;
    let designAiTotal = 0;
    let designUploadTotal = 0;
    let flowersTotal = 0;
    if (!Array.isArray(items)) return { giftWrapTotal, designAiTotal, designUploadTotal, flowersTotal };
    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const opts = Array.isArray(item.options) ? item.options : [];
        for (const option of opts) {
            if (!option || typeof option !== 'object') continue;
            if (option.checkbox_wrrapd) {
                giftWrapTotal += p.giftWrapBase;
                if (option.selected_wrapping_option === 'ai') {
                    designAiTotal += p.customDesignAi;
                } else if (option.selected_wrapping_option === 'upload') {
                    designUploadTotal += p.customDesignUpload;
                }
            }
            if (option.checkbox_flowers) {
                flowersTotal += p.flowers;
            }
        }
    }
    return {
        giftWrapTotal: round2(giftWrapTotal),
        designAiTotal: round2(designAiTotal),
        designUploadTotal: round2(designUploadTotal),
        flowersTotal: round2(flowersTotal),
    };
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

/**
 * @param {{ items: unknown[], taxRatePercent: number, postalCode?: string, state?: string, country?: string }} pricingCart
 */
function computeTotalUsdFromPricingCart(pricingCart) {
    const taxRaw = pricingCart && pricingCart.taxRatePercent;
    const taxRatePercent =
        typeof taxRaw === 'number' && Number.isFinite(taxRaw) ? Math.max(0, Math.min(100, taxRaw)) : 0;
    const geo = {
        postalCode: pricingCart && pricingCart.postalCode,
        state: pricingCart && pricingCart.state,
        country: pricingCart && pricingCart.country,
        retailer: pricingCart && pricingCart.retailer,
    };
    const resolved = resolveWrrapdUnitPrices(geo, geo.retailer);
    const { unitPrices, configVersion, appliedRuleIds, timeZone } = resolved;
    const br = computeSubtotalFromPricingCartItems(pricingCart && pricingCart.items, unitPrices);
    const subtotal = round2(
        br.giftWrapTotal + br.designAiTotal + br.designUploadTotal + br.flowersTotal,
    );
    const estimatedTax = round2(subtotal * (taxRatePercent / 100));
    const total = round2(subtotal + estimatedTax);
    return {
        unitPrices,
        breakdown: br,
        subtotal,
        estimatedTax,
        total,
        taxRatePercent,
        configVersion,
        appliedRuleIds,
        timeZone,
    };
}

function computeTotalCentsFromPricingCart(pricingCart) {
    const r = computeTotalUsdFromPricingCart(pricingCart);
    const cents = Math.round(r.total * 100);
    if (!Number.isFinite(cents) || cents <= 0) return { ok: false, error: 'Non-positive total' };
    if (cents > 99999999) return { ok: false, error: 'Amount too large' };
    return {
        ok: true,
        cents,
        subtotal: r.subtotal,
        estimatedTax: r.estimatedTax,
        total: r.total,
        unitPrices: r.unitPrices,
        configVersion: r.configVersion,
        appliedRuleIds: r.appliedRuleIds,
        breakdown: r.breakdown,
        taxRatePercent: r.taxRatePercent,
    };
}

function sanitizePricingCartFromRequest(body) {
    if (!body || typeof body !== 'object') return null;
    const itemsIn = Array.isArray(body.items) ? body.items : [];
    const items = [];
    for (const it of itemsIn.slice(0, 80)) {
        if (!it || typeof it !== 'object') continue;
        const optsIn = Array.isArray(it.options) ? it.options : [];
        const options = [];
        for (const o of optsIn.slice(0, 40)) {
            if (!o || typeof o !== 'object') continue;
            options.push({
                checkbox_wrrapd: o.checkbox_wrrapd === true,
                selected_wrapping_option:
                    o.selected_wrapping_option != null
                        ? String(o.selected_wrapping_option).toLowerCase().slice(0, 32)
                        : null,
                checkbox_flowers: o.checkbox_flowers === true,
            });
        }
        items.push({ options });
    }
    const taxRaw = body.taxRatePercent;
    let taxRatePercent =
        typeof taxRaw === 'number' && Number.isFinite(taxRaw)
            ? Math.max(0, Math.min(100, taxRaw))
            : typeof taxRaw === 'string' && taxRaw.trim() !== ''
                ? Math.max(0, Math.min(100, parseFloat(taxRaw)))
                : null;
    const postalCode = typeof body.postalCode === 'string' ? body.postalCode.slice(0, 16) : '';
    const state = typeof body.state === 'string' ? body.state.slice(0, 16) : '';
    const country = typeof body.country === 'string' ? body.country.slice(0, 8) : '';
    const zip5 = String(postalCode || HUB_TAX_ZIP5)
        .replace(/\D/g, '')
        .slice(0, 5) || HUB_TAX_ZIP5;
    const countryU = String(country || 'US')
        .trim()
        .toUpperCase();
    const treatAsUS =
        !countryU ||
        countryU === 'US' ||
        countryU === 'USA' ||
        countryU === 'UNITED STATES' ||
        countryU === 'UNITED STA';
    if (zip5.length === 5 && treatAsUS) {
        const fromTable = salesTaxZip.getCombinedRateAsTaxPercent(zip5);
        if (fromTable !== null) taxRatePercent = fromTable;
    }
    if (taxRatePercent === null || !Number.isFinite(taxRatePercent)) {
        taxRatePercent = HUB_DEFAULT_TAX_PERCENT;
    }
    return {
        items,
        taxRatePercent,
        postalCode: zip5,
        state: state || undefined,
        country: country || undefined,
        retailer:
            typeof body.retailer === 'string'
                ? normalizeRetailerSlug(body.retailer)
                : undefined,
    };
}

function getPricingConfigForAdmin() {
    return loadPricingConfig();
}

function savePricingConfigFromAdmin(body) {
    const next = normalizePricingConfig(body);
    next.version =
        typeof body.version === 'string' && body.version.trim()
            ? body.version.trim().slice(0, 64)
            : new Date().toISOString().slice(0, 10);
    fs.mkdirSync(path.dirname(PRICING_CONFIG_PATH), { recursive: true });
    fs.writeFileSync(PRICING_CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    cachedConfig = next;
    cachedConfigSignature = '';
    return next;
}

module.exports = {
    resolveWrrapdUnitPrices,
    computeTotalCentsFromPricingCart,
    computeTotalUsdFromPricingCart,
    sanitizePricingCartFromRequest,
    parseConfigFromEnv,
    loadPricingConfig,
    getPricingConfigForAdmin,
    savePricingConfigFromAdmin,
    normalizeRetailerSlug,
    DEFAULT_UNIT,
};
