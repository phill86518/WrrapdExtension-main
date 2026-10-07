/**
 * Volume (multi-item) discount on the gift-wrap base price.
 * Mirrored in extension/src/shared/volume-discount.js — keep the math identical.
 *
 * Tiers by wrapped-unit count in one checkout: 2, 3–9, 10+. Whole percents 0–99.
 * Discount = tier % of (giftWrapBase × count), rounded half-up to the cent, pre-tax.
 */

const ZERO_VOLUME_DISCOUNT = Object.freeze({
    twoItemsPercent: 0,
    threeToNineItemsPercent: 0,
    tenPlusItemsPercent: 0,
});

function wholePercent(v) {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(99, Math.round(n));
}

/** Lenient read (stored config, preview responses). Never throws. */
function normalizeVolumeDiscount(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        twoItemsPercent: wholePercent(src.twoItemsPercent),
        threeToNineItemsPercent: wholePercent(src.threeToNineItemsPercent),
        tenPlusItemsPercent: wholePercent(src.tenPlusItemsPercent),
    };
}

/** @returns {string|null} error message when tiers are not 10+ ≥ 3–9 ≥ 2. */
function volumeDiscountOrderError(tiers) {
    const t = normalizeVolumeDiscount(tiers);
    if (t.threeToNineItemsPercent < t.twoItemsPercent) {
        return '"3 to 9 items" discount must be greater than or equal to "2 items" discount.';
    }
    if (t.tenPlusItemsPercent < t.threeToNineItemsPercent) {
        return '"10+ items" discount must be greater than or equal to "3 to 9 items" discount.';
    }
    return null;
}

function volumeDiscountPercentFor(tiers, wrappedCount) {
    const t = normalizeVolumeDiscount(tiers);
    const n = Math.floor(Number(wrappedCount) || 0);
    if (n >= 10) return t.tenPlusItemsPercent;
    if (n >= 3) return t.threeToNineItemsPercent;
    if (n === 2) return t.twoItemsPercent;
    return 0;
}

/**
 * @returns {{ percent: number, baseTotalCents: number, discountCents: number }}
 */
function computeMultiItemBaseDiscount(giftWrapBase, wrappedCount, tiers) {
    const n = Math.max(0, Math.floor(Number(wrappedCount) || 0));
    const unitCents = Math.round((Number(giftWrapBase) || 0) * 100);
    const baseTotalCents = unitCents > 0 ? unitCents * n : 0;
    const percent = volumeDiscountPercentFor(tiers, n);
    const discountCents = percent > 0 ? Math.floor((baseTotalCents * percent + 50) / 100) : 0;
    return { percent, baseTotalCents, discountCents };
}

/** Split a discount evenly across wrapped units; first units absorb leftover cents. */
function allocateDiscountCents(discountCents, wrappedCount) {
    const n = Math.max(0, Math.floor(Number(wrappedCount) || 0));
    const total = Math.max(0, Math.floor(Number(discountCents) || 0));
    if (!n) return [];
    const each = Math.floor(total / n);
    const extra = total - each * n;
    return Array.from({ length: n }, (_, i) => each + (i < extra ? 1 : 0));
}

module.exports = {
    ZERO_VOLUME_DISCOUNT,
    normalizeVolumeDiscount,
    volumeDiscountOrderError,
    volumeDiscountPercentFor,
    computeMultiItemBaseDiscount,
    allocateDiscountCents,
};
