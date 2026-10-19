const test = require('node:test');
const assert = require('node:assert/strict');
const supplied = require('../lib/buy/supplied-product');
const quotes = require('../lib/buy/quotes');

const now = new Date('2026-10-14T17:00:00.000Z');

test('supplied Nordstrom facts fill the cart line', () => {
    const built = supplied.build({
        title: 'SKIMS Soft Lounge Rib Sleep Set',
        priceUsd: '$128.00',
        shippingUsd: 0,
        arrives: 'Tue, Oct 20',
        color: 'Cherry Blossom',
        size: 'X-Small',
    }, now);
    assert.equal(built.ok, true);
    assert.equal(built.product.pagePriceCents, 12800);
    assert.equal(built.product.standardShip.cents, 0);
    assert.equal(built.product.standardShip.arrivalDate, '2026-10-20');
    assert.equal(built.variantLabel, 'Color: Cherry Blossom, Size: X-Small');
    assert.equal(built.product.readBy, 'supplied');

    const line = { id: 'L1', state: 'unavailable', reason: 'quote_timeout', message: 'no', removed: false, product: null };
    const out = quotes.acceptSupplied(line, {
        title: 'SKIMS Soft Lounge Rib Sleep Set',
        priceCents: 12800,
        shippingCents: 0,
        arrivalDate: '2026-10-20',
        variantLabel: 'Color: Cherry Blossom, Size: X-Small',
    }, { perItemCapCents: 20000, allowElectronics: false });
    assert.equal(out.ok, true);
    assert.equal(line.state, 'quoting');
    assert.equal(line.product.pagePriceCents, 12800);
    assert.equal(line.product.standardShip.arrivalDate, '2026-10-20');
    assert.equal(line.variantLabel, 'Color: Cherry Blossom, Size: X-Small');
    assert.equal(line.reason, '');
});

test('a supplied price over the limit stays off the cart', () => {
    const line = { id: 'L1', state: 'quoting', reason: '', message: '', product: null };
    const out = quotes.acceptSupplied(line, {
        title: 'Cast Iron Dutch Oven',
        priceUsd: 140,
        shipping: 0,
    }, { perItemCapCents: 10000, allowElectronics: false });
    assert.equal(out.ok, false);
    assert.equal(line.state, 'unavailable');
    assert.match(line.message, /\$140\.00 versus \$100\.00/);
});

test('supplied facts need a title and a price', () => {
    assert.equal(supplied.build({ priceUsd: 10, shipping: 0 }, now).ok, false);
    assert.equal(supplied.build({ title: 'Hat', shipping: 0 }, now).ok, false);
    const priceOnly = supplied.build({ title: 'Hat', priceUsd: 10, imageUrl: 'https://example.com/hat.jpg' }, now);
    assert.equal(priceOnly.ok, true);
    assert.equal(priceOnly.product.pagePriceCents, 1000);
    assert.equal(priceOnly.product.pageOffer, null);
    assert.equal(supplied.build({ title: 'Hat', priceUsd: 10, shipping: 0, arrives: 'sometime' }, now).ok, false);
    assert.equal(supplied.build({ title: 'Hat', priceUsd: 10, imageUrl: 'http://example.com/hat.jpg' }, now).ok, false);
});
