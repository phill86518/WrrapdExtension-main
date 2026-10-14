const test = require('node:test');
const assert = require('node:assert/strict');
const reader = require('../lib/buy/page-reader');

function page({ postal, date, price, free, strength }) {
    const fulfillmentPrice = price == null ? 'null' : JSON.stringify({ price, priceString: `$${price.toFixed(2)}` });
    return [
        `"pageMetadata":{"location":{"postalCode":"${postal}","intentStrength":"${strength || 'EXPLICIT'}"}}`,
        `"shippingText":"Shipping","fulfillmentText":"arrives by tomorrow","locationText":"Somewhere, ${postal}","fulfillmentMethod":"SHIPPING","postalCode":"${postal}"`,
        `"__typename":"ShippingOptionV2","type":"SHIPPING","speedDetails":{"deliveryDate":"${date}T21:59:00.000Z","storeDeliveryDate":"${date}T16:59:00.000-05:00","fulfillmentPrice":${fulfillmentPrice},"freeFulfillment":${free ? 'true' : 'false'}}`,
    ].join(',');
}

test('walmart shipping price and date when the page ZIP matches', () => {
    const ship = reader.walmartShip(page({ postal: '32218', date: '2026-10-16', price: 6.99, free: false }), '32218');
    assert.equal(ship.cents, 699);
    assert.equal(ship.arrivalDate, '2026-10-16');
    assert.equal(ship.choicePrompt, '');
});

test('walmart free shipping', () => {
    const ship = reader.walmartShip(page({ postal: '32218', date: '2026-10-16', price: null, free: true }), '32218');
    assert.equal(ship.cents, 0);
    assert.equal(ship.arrivalDate, '2026-10-16');
});

test('walmart does not use a date from a different ZIP the shopper set', () => {
    const ship = reader.walmartShip(page({ postal: '51502', date: '2026-10-15', price: null, free: false, strength: 'EXPLICIT' }), '32218');
    assert.equal(ship.arrivalDate, null);
    assert.equal(ship.cents, null);
    assert.match(ship.choicePrompt, /51502/);
    assert.match(ship.choicePrompt, /32218/);
});

test('a guessed server location is not the shopper page ZIP', () => {
    const ship = reader.walmartShip(page({ postal: '51502', date: '2026-10-15', price: null, free: false, strength: 'IMPLICIT' }), '32218');
    assert.equal(ship.skip, true);
});

test('arrives tomorrow is a delivery date', () => {
    const ship = reader.standardFromPage('<p>Shipping Arrives tomorrow</p>', 3499);
    assert.equal(ship.cents, null);
    assert.match(ship.arrivalDate, /^\d{4}-\d{2}-\d{2}$/);
});
