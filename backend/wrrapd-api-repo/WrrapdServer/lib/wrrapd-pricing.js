/**
 * Dynamic Wrrapd unit pricing (geo hints, calendar surges, global multiplier).
 * Configure with env WRRAPD_PRICE_CONFIG_JSON (stringified JSON). Safe defaults when unset.
 */

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
});

let cachedConfig = null;
let cachedConfigRaw = '';

function parseConfigFromEnv() {
    const raw = (process.env.WRRAPD_PRICE_CONFIG_JSON || '').trim();
    if (!raw) {
        cachedConfig = { ...DEFAULT_CONFIG, defaultUnitPrices: { ...DEFAULT_UNIT } };
        cachedConfigRaw = '';
        return cachedConfig;
    }
    if (raw === cachedConfigRaw && cachedConfig) return cachedConfig;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        console.error('[wrrapd-pricing] Invalid WRRAPD_PRICE_CONFIG_JSON, using defaults:', e.message);
        cachedConfig = { ...DEFAULT_CONFIG, defaultUnitPrices: { ...DEFAULT_UNIT } };
        cachedConfigRaw = raw;
        return cachedConfig;
    }
    const base = parsed.defaultUnitPrices && typeof parsed.defaultUnitPrices === 'object' ? parsed.defaultUnitPrices : {};
    const defaultUnitPrices = {
        giftWrapBase: numOr(base.giftWrapBase, DEFAULT_UNIT.giftWrapBase),
        customDesignAi: numOr(base.customDesignAi, DEFAULT_UNIT.customDesignAi),
        customDesignUpload: numOr(base.customDesignUpload, DEFAULT_UNIT.customDesignUpload),
        flowers: numOr(base.flowers, DEFAULT_UNIT.flowers),
    };
    const globalMultiplier = clampMult(parsed.globalMultiplier, 1);
    const rules = Array.isArray(parsed.rules) ? parsed.rules.slice(0, 64) : [];
    cachedConfig = {
        version: typeof parsed.version === 'string' ? parsed.version.slice(0, 64) : 'custom',
        defaultUnitPrices,
        globalMultiplier,
        rules,
    };
    cachedConfigRaw = raw;
    return cachedConfig;
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
 */
function resolveWrrapdUnitPrices(geo) {
    const cfg = parseConfigFromEnv();
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
    };
    const resolved = resolveWrrapdUnitPrices(geo);
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
    const taxRatePercent =
        typeof taxRaw === 'number' && Number.isFinite(taxRaw)
            ? Math.max(0, Math.min(100, taxRaw))
            : typeof taxRaw === 'string' && taxRaw.trim() !== ''
                ? Math.max(0, Math.min(100, parseFloat(taxRaw)))
                : null;
    if (taxRatePercent === null || !Number.isFinite(taxRatePercent)) return null;
    const postalCode = typeof body.postalCode === 'string' ? body.postalCode.slice(0, 16) : '';
    const state = typeof body.state === 'string' ? body.state.slice(0, 16) : '';
    const country = typeof body.country === 'string' ? body.country.slice(0, 8) : '';
    return {
        items,
        taxRatePercent,
        postalCode: postalCode || undefined,
        state: state || undefined,
        country: country || undefined,
    };
}

module.exports = {
    resolveWrrapdUnitPrices,
    computeTotalCentsFromPricingCart,
    computeTotalUsdFromPricingCart,
    sanitizePricingCartFromRequest,
    parseConfigFromEnv,
    DEFAULT_UNIT,
};
