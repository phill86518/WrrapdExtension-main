/**
 * Shared Wrrapd unit prices for gift modals and checkout summaries.
 * Fetches geo-aware prices from /api/pricing-preview when possible.
 */
export const UNIT_PRICES_FALLBACK = Object.freeze({
  giftWrapBase: 6.99,
  customDesignAi: 2.99,
  customDesignUpload: 1.99,
  flowers: 17.99,
});

const PRICE_REFRESH_TTL_MS = 5 * 60 * 1000;

/** @returns {{ unitPriceOverride: object|null, fetchPromise: Promise<void>|null, lastFetchAt: number, lastGeoKey: string }} */
export function createUnitPricingState() {
  return {
    unitPriceOverride: null,
    fetchPromise: null,
    lastFetchAt: 0,
    lastGeoKey: "",
  };
}

export function getActiveUnitPrices(state) {
  return state?.unitPriceOverride || UNIT_PRICES_FALLBACK;
}

function normalizePostal5(zip) {
  return String(zip || "")
    .replace(/\D/g, "")
    .slice(0, 5);
}

function geoCacheKey(geo, retailer) {
  return [
    normalizePostal5(geo?.postalCode),
    String(geo?.state || "").trim().toUpperCase(),
    String(geo?.country || "").trim().toUpperCase(),
    String(retailer || "").trim().toLowerCase(),
  ].join("|");
}

function unitPricesSessionKey(prefix) {
  return `${prefix}ResolvedUnitPrices`;
}

/**
 * Persist the unit prices the shopper saw after giftee ZIP Submit,
 * so payment summary / Stripe use the same catalog (not Duval fallback).
 */
export function writePersistedUnitPrices(sessionPrefix, prices, postalCode) {
  if (!sessionPrefix || !prices) return;
  const zip = normalizePostal5(postalCode);
  const next = {
    postalCode: zip,
    unitPrices: {
      giftWrapBase: Number(prices.giftWrapBase),
      customDesignAi: Number(prices.customDesignAi),
      customDesignUpload: Number(prices.customDesignUpload),
      flowers: Number(prices.flowers),
    },
    at: Date.now(),
  };
  if (
    !Object.values(next.unitPrices).every((n) => Number.isFinite(n) && n >= 0 && n < 100000)
  ) {
    return;
  }
  try {
    sessionStorage.setItem(unitPricesSessionKey(sessionPrefix), JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** @returns {{ postalCode: string, unitPrices: object, at: number } | null} */
export function readPersistedUnitPrices(sessionPrefix) {
  if (!sessionPrefix) return null;
  try {
    const raw = sessionStorage.getItem(unitPricesSessionKey(sessionPrefix));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const up = parsed?.unitPrices;
    if (!up || typeof up !== "object") return null;
    const unitPrices = {
      giftWrapBase: Number(up.giftWrapBase),
      customDesignAi: Number(up.customDesignAi),
      customDesignUpload: Number(up.customDesignUpload),
      flowers: Number(up.flowers),
    };
    if (!Object.values(unitPrices).every((n) => Number.isFinite(n) && n >= 0 && n < 100000)) {
      return null;
    }
    return {
      postalCode: normalizePostal5(parsed.postalCode),
      unitPrices,
      at: Number(parsed.at) || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Seed in-memory override from modal-persisted prices when ZIP matches.
 * @returns {boolean}
 */
export function hydrateUnitPricesFromSession(state, sessionPrefix, expectedZip) {
  if (!state) return false;
  const data = readPersistedUnitPrices(sessionPrefix);
  if (!data?.unitPrices) return false;
  const want = normalizePostal5(expectedZip);
  if (want.length === 5 && data.postalCode && data.postalCode !== want) return false;
  state.unitPriceOverride = data.unitPrices;
  return true;
}

async function refreshUnitPricesFromServer(state, geo, retailer) {
  try {
    const u = new URL("https://api.wrrapd.com/api/pricing-preview");
    if (geo?.postalCode) u.searchParams.set("postalCode", String(geo.postalCode).trim().slice(0, 16));
    if (geo?.state) u.searchParams.set("state", String(geo.state).trim().slice(0, 16));
    if (geo?.country) u.searchParams.set("country", String(geo.country).trim().slice(0, 8));
    if (retailer) u.searchParams.set("retailer", String(retailer).trim().slice(0, 32));
    const signal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(8000) : undefined;
    const r = await fetch(u.toString(), { credentials: "omit", signal });
    if (!r.ok) return false;
    const j = await r.json();
    const up = j && typeof j.unitPrices === "object" ? j.unitPrices : null;
    if (!up) return false;
    const next = {
      giftWrapBase: Number(up.giftWrapBase),
      customDesignAi: Number(up.customDesignAi),
      customDesignUpload: Number(up.customDesignUpload),
      flowers: Number(up.flowers),
    };
    if (Object.values(next).every((n) => Number.isFinite(n) && n >= 0 && n < 100000)) {
      state.unitPriceOverride = next;
      return true;
    }
  } catch {
    /* fall back to defaults / persisted */
  }
  return false;
}

/**
 * Memoized price refresh. Cache key includes postalCode so a modal ZIP change
 * always refetches (never reuse Duval/hub prices for Miami-Dade, etc.).
 * @param {{ sessionPrefix?: string }} [opts]
 */
export function ensureUnitPrices(state, geo, retailer, opts = {}) {
  const geoKey = geoCacheKey(geo, retailer);
  const now = Date.now();
  if (
    state.lastPriceFetchAt &&
    state.lastGeoKey === geoKey &&
    now - state.lastPriceFetchAt < PRICE_REFRESH_TTL_MS &&
    state.unitPriceOverride
  ) {
    return Promise.resolve(true);
  }
  if (!state.fetchPromise) {
    state.fetchPromise = refreshUnitPricesFromServer(state, geo, retailer)
      .then((ok) => {
        state.lastGeoKey = geoKey;
        state.lastFetchAt = Date.now();
        if (ok && opts.sessionPrefix) {
          writePersistedUnitPrices(opts.sessionPrefix, state.unitPriceOverride, geo?.postalCode);
        }
        return ok;
      })
      .finally(() => {
        state.fetchPromise = null;
      });
  }
  return state.fetchPromise;
}

export function formatUsd(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  return `$${n.toFixed(2)}`;
}
