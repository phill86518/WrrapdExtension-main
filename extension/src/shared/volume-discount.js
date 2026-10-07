/**
 * Volume (multi-item) discount on the gift-wrap base price.
 * Mirrors backend WrrapdServer/lib/volume-discount.js — the pay server recomputes the
 * charge with the same math, so keep both files identical in behavior.
 *
 * Tiers by wrapped-unit count in one checkout: 2, 3–9, 10+ (whole percents, set in
 * Command Center → Checkout pricing → Volume Discounting). Pre-tax, base price only.
 */

export const MULTI_ITEM_DISCOUNT_LABEL = "Multi-item base discount";
export const MULTI_ITEM_DISCOUNT_CODE = "WRPD_MULTI_ITEM_DISCOUNT";

const STORAGE_KEY = "wrrapdVolumeDiscount";

export const ZERO_VOLUME_DISCOUNT = Object.freeze({
  twoItemsPercent: 0,
  threeToNineItemsPercent: 0,
  tenPlusItemsPercent: 0,
});

function wholePercent(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(99, Math.round(n));
}

export function normalizeVolumeDiscount(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    twoItemsPercent: wholePercent(src.twoItemsPercent),
    threeToNineItemsPercent: wholePercent(src.threeToNineItemsPercent),
    tenPlusItemsPercent: wholePercent(src.tenPlusItemsPercent),
  };
}

export function volumeDiscountPercentFor(tiers, wrappedCount) {
  const t = normalizeVolumeDiscount(tiers);
  const n = Math.floor(Number(wrappedCount) || 0);
  if (n >= 10) return t.tenPlusItemsPercent;
  if (n >= 3) return t.threeToNineItemsPercent;
  if (n === 2) return t.twoItemsPercent;
  return 0;
}

/** @returns {{ percent: number, baseTotalCents: number, discountCents: number }} */
export function computeMultiItemBaseDiscount(giftWrapBase, wrappedCount, tiers) {
  const n = Math.max(0, Math.floor(Number(wrappedCount) || 0));
  const unitCents = Math.round((Number(giftWrapBase) || 0) * 100);
  const baseTotalCents = unitCents > 0 ? unitCents * n : 0;
  const percent = volumeDiscountPercentFor(tiers, n);
  const discountCents = percent > 0 ? Math.floor((baseTotalCents * percent + 50) / 100) : 0;
  return { percent, baseTotalCents, discountCents };
}

/** Split a discount evenly across wrapped units; first units absorb leftover cents. */
export function allocateDiscountCents(discountCents, wrappedCount) {
  const n = Math.max(0, Math.floor(Number(wrappedCount) || 0));
  const total = Math.max(0, Math.floor(Number(discountCents) || 0));
  if (!n) return [];
  const each = Math.floor(total / n);
  const extra = total - each * n;
  return Array.from({ length: n }, (_, i) => each + (i < extra ? 1 : 0));
}

/**
 * Shopper nudge when one more wrapped item reaches a higher discount tier.
 * @returns {string|null}
 */
export function volumeDiscountNudgeText(tiers, wrappedCount) {
  const n = Math.floor(Number(wrappedCount) || 0);
  if (n < 1) return null;
  const now = volumeDiscountPercentFor(tiers, n);
  const next = volumeDiscountPercentFor(tiers, n + 1);
  if (next <= now) return null;
  return `Gift-wrap another item to get a ${next}% discount!`;
}

/** Remember the tiers from a /api/pricing-preview response. A body with no tiers keeps the last good ones. */
export function rememberVolumeDiscountFromPreview(previewJson) {
  const raw = previewJson && previewJson.volumeDiscount;
  if (!raw || typeof raw !== "object") return readVolumeDiscount();
  const tiers = normalizeVolumeDiscount(raw);
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tiers));
  } catch {
    /* ignore */
  }
  return tiers;
}

export function readVolumeDiscount() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeVolumeDiscount(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return { ...ZERO_VOLUME_DISCOUNT };
}

/**
 * Discount for this checkout using the remembered tiers.
 * @returns {{ percent: number, discountCents: number, discountUsd: number }}
 */
export function multiItemDiscountFor(giftWrapBase, wrappedCount) {
  const r = computeMultiItemBaseDiscount(giftWrapBase, wrappedCount, readVolumeDiscount());
  return {
    percent: r.discountCents > 0 ? r.percent : 0,
    discountCents: r.discountCents,
    discountUsd: r.discountCents / 100,
  };
}

/** "-$1.40" */
export function formatDiscountUsd(discountCents) {
  return `-$${(Math.max(0, discountCents) / 100).toFixed(2)}`;
}
