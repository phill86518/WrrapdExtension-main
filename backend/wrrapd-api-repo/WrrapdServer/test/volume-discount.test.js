const test = require('node:test');
const assert = require('node:assert/strict');
const vd = require('../lib/volume-discount');
const pricing = require('../lib/wrrapd-pricing');

const TIERS = { twoItemsPercent: 10, threeToNineItemsPercent: 15, tenPlusItemsPercent: 15 };
const PRICES = { giftWrapBase: 6.99, customDesignAi: 2.99, customDesignUpload: 1.99, flowers: 17.99 };

test('tier boundaries: 1 none, 2, 3-9, 10+', () => {
    const t = { twoItemsPercent: 5, threeToNineItemsPercent: 10, tenPlusItemsPercent: 20 };
    assert.equal(vd.volumeDiscountPercentFor(t, 0), 0);
    assert.equal(vd.volumeDiscountPercentFor(t, 1), 0);
    assert.equal(vd.volumeDiscountPercentFor(t, 2), 5);
    assert.equal(vd.volumeDiscountPercentFor(t, 3), 10);
    assert.equal(vd.volumeDiscountPercentFor(t, 9), 10);
    assert.equal(vd.volumeDiscountPercentFor(t, 10), 20);
    assert.equal(vd.volumeDiscountPercentFor(t, 40), 20);
});

test('discount is % of the base total, half-up to the cent', () => {
    assert.equal(vd.computeMultiItemBaseDiscount(6.99, 2, TIERS).discountCents, 140); // 10% of 13.98
    assert.equal(vd.computeMultiItemBaseDiscount(6.99, 3, TIERS).discountCents, 315); // 15% of 20.97 = 3.1455
    assert.equal(vd.computeMultiItemBaseDiscount(6.99, 4, TIERS).discountCents, 419); // 15% of 27.96 = 4.194
    assert.equal(vd.computeMultiItemBaseDiscount(6.99, 10, TIERS).discountCents, 1049); // 15% of 69.90 = 10.485
    assert.equal(vd.computeMultiItemBaseDiscount(6.99, 1, TIERS).discountCents, 0);
    assert.equal(vd.computeMultiItemBaseDiscount(6.99, 5, vd.ZERO_VOLUME_DISCOUNT).discountCents, 0);
});

test('allocation sums exactly to the discount', () => {
    assert.deepEqual(vd.allocateDiscountCents(140, 2), [70, 70]);
    assert.deepEqual(vd.allocateDiscountCents(315, 3), [105, 105, 105]);
    assert.deepEqual(vd.allocateDiscountCents(419, 4), [105, 105, 105, 104]);
    assert.equal(vd.allocateDiscountCents(1049, 10).reduce((a, b) => a + b, 0), 1049);
});

test('tier order rule: 10+ >= 3-9 >= 2', () => {
    assert.equal(vd.volumeDiscountOrderError(TIERS), null);
    assert.equal(vd.volumeDiscountOrderError(vd.ZERO_VOLUME_DISCOUNT), null);
    assert.match(vd.volumeDiscountOrderError({ twoItemsPercent: 10, threeToNineItemsPercent: 5, tenPlusItemsPercent: 20 }), /3 to 9/);
    assert.match(vd.volumeDiscountOrderError({ twoItemsPercent: 5, threeToNineItemsPercent: 15, tenPlusItemsPercent: 10 }), /10\+/);
});

test('percent fields are whole numbers 0-99', () => {
    assert.deepEqual(vd.normalizeVolumeDiscount({ twoItemsPercent: '7', threeToNineItemsPercent: -3, tenPlusItemsPercent: 150 }), {
        twoItemsPercent: 7,
        threeToNineItemsPercent: 0,
        tenPlusItemsPercent: 99,
    });
    assert.deepEqual(vd.normalizeVolumeDiscount(undefined), vd.ZERO_VOLUME_DISCOUNT);
});

const wrapped = (n, extra = {}) =>
    Array.from({ length: n }, (_, i) => ({ title: `Book ${i}`, options: [{ checkbox_wrrapd: true, title: `Book ${i}`, ...extra }] }));

test('subtotal breakdown carries the discount; add-ons are not discounted', () => {
    const br = pricing.computeSubtotalFromPricingCartItems(wrapped(2, { selected_wrapping_option: 'ai' }), PRICES, TIERS);
    assert.equal(br.giftWrapCount, 2);
    assert.equal(br.giftWrapTotal, 13.98);
    assert.equal(br.multiItemDiscountPercent, 10);
    assert.equal(br.multiItemDiscount, 1.4);
    assert.equal(br.designAiTotal, 5.98);
});

test('tax is computed on the wrap base after the discount', () => {
    const br = pricing.computeSubtotalFromPricingCartItems(wrapped(2), PRICES, TIERS);
    const subtotal = Math.round((br.giftWrapTotal - br.multiItemDiscount) * 100) / 100;
    assert.equal(subtotal, 12.58);
    const tax = Math.round(subtotal * 0.075 * 100) / 100;
    assert.equal(tax, 0.94);
});

test('zero rates or one item give no discount', () => {
    assert.equal(pricing.computeSubtotalFromPricingCartItems(wrapped(1), PRICES, TIERS).multiItemDiscount, 0);
    const z = pricing.computeSubtotalFromPricingCartItems(wrapped(3), PRICES, vd.ZERO_VOLUME_DISCOUNT);
    assert.equal(z.multiItemDiscount, 0);
    assert.equal(z.multiItemDiscountPercent, 0);
});

test('server quote only discounts carts that say they show the line', () => {
    const body = { postalCode: '32218', items: wrapped(2) };
    const cart = pricing.sanitizePricingCartFromRequest(body);
    assert.equal(cart.multiItemDiscountAware, false);
    assert.equal(pricing.sanitizePricingCartFromRequest({ ...body, multiItemDiscountAware: true }).multiItemDiscountAware, true);
    const r = pricing.computeTotalUsdFromPricingCart(cart);
    assert.equal(r.breakdown.multiItemDiscount, 0);
    assert.equal(r.subtotal, 13.98);
});
