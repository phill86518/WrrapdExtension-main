const test = require('node:test');
const assert = require('node:assert/strict');
const pricing = require('../lib/wrrapd-pricing');

function quote(body) {
    return pricing.computeTotalUsdFromPricingCart(pricing.sanitizePricingCartFromRequest(body));
}

const wrap = (title, extra = {}) => ({ title, options: [{ checkbox_wrrapd: true, title, ...extra }] });

test('loose item is charged the $0.99 box after server sanitizing', () => {
    const r = quote({ postalCode: '32218', items: [wrap('Cotton sweater')] });
    assert.equal(r.breakdown.boxCount, 1);
    assert.equal(r.breakdown.boxTotal, 0.99);
});

test('boxed retail items (LEGO, books, electronics) get no box charge', () => {
    for (const title of ['LEGO Star Wars set', 'Hardcover novel', 'Bluetooth speaker']) {
        const r = quote({ postalCode: '32218', items: [wrap(title)] });
        assert.equal(r.breakdown.boxCount, 0, title);
    }
});

test('flowers never add a box', () => {
    const r = quote({ postalCode: '32218', items: [wrap('Cotton sweater', { checkbox_flowers: true })] });
    assert.equal(r.breakdown.boxCount, 0);
});

test('category alone is enough for the box rule', () => {
    const body = { postalCode: '32218', items: [{ itemCategory: 'Book', options: [{ checkbox_wrrapd: true }] }] };
    assert.equal(quote(body).breakdown.boxCount, 0);
});

test('client-sent tax rate is replaced by the ZIP table', () => {
    const a = quote({ postalCode: '32218', taxRatePercent: 0, items: [wrap('Book')] });
    const b = quote({ postalCode: '32218', taxRatePercent: 50, items: [wrap('Book')] });
    assert.equal(a.total, b.total);
    assert.ok(a.taxRatePercent > 0);
});

test('totals: one wrap + box + Duval tax', () => {
    const r = quote({ postalCode: '32218', items: [wrap('Cotton sweater')] });
    assert.equal(r.subtotal, 7.98);
    assert.equal(r.total, Math.round(7.98 * (1 + r.taxRatePercent / 100) * 100) / 100);
});

test('unchecked lines are free', () => {
    const r = quote({ postalCode: '32218', items: [{ title: 'Sweater', options: [{ checkbox_wrrapd: false }] }] });
    assert.equal(r.subtotal, 0);
    assert.equal(pricing.computeTotalCentsFromPricingCart(pricing.sanitizePricingCartFromRequest({ items: [] })).ok, false);
});
