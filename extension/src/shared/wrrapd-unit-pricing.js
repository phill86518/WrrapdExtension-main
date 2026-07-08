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

/** @returns {{ unitPriceOverride: object|null, fetchPromise: Promise<void>|null, lastFetchAt: number }} */
export function createUnitPricingState() {
  return {
    unitPriceOverride: null,
    fetchPromise: null,
    lastFetchAt: 0,
  };
}

export function getActiveUnitPrices(state) {
  return state?.unitPriceOverride || UNIT_PRICES_FALLBACK;
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
    if (!r.ok) return;
    const j = await r.json();
    const up = j && typeof j.unitPrices === "object" ? j.unitPrices : null;
    if (!up) return;
    const next = {
      giftWrapBase: Number(up.giftWrapBase),
      customDesignAi: Number(up.customDesignAi),
      customDesignUpload: Number(up.customDesignUpload),
      flowers: Number(up.flowers),
    };
    if (Object.values(next).every((n) => Number.isFinite(n) && n >= 0 && n < 100000)) {
      state.unitPriceOverride = next;
    }
  } catch {
    /* fall back to defaults */
  }
}

/** Memoized price refresh for modal surfaces. */
export function ensureUnitPrices(state, geo, retailer) {
  const now = Date.now();
  if (state.lastPriceFetchAt && now - state.lastPriceFetchAt < PRICE_REFRESH_TTL_MS) {
    return Promise.resolve();
  }
  if (!state.fetchPromise) {
    state.fetchPromise = refreshUnitPricesFromServer(state, geo, retailer).finally(() => {
      state.fetchPromise = null;
      state.lastFetchAt = Date.now();
    });
  }
  return state.fetchPromise;
}

export function formatUsd(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  return `$${n.toFixed(2)}`;
}
