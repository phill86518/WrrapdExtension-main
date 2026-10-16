const test = require('node:test');
const assert = require('node:assert/strict');
const ship = require('../lib/buy/standard-shipping');

test('a retailer order at the free-shipping minimum ships free', () => {
    assert.equal(ship.groupShipCents('walmart', 3500, 699), 0);
    assert.equal(ship.groupShipCents('target', 3500, null), 0);
    assert.equal(ship.groupShipCents('kohls', 4900, 895), 0);
    assert.equal(ship.groupShipCents('sephora', 5000, 695), 0);
    assert.equal(ship.groupShipCents('ulta', 3500, 695), 0);
    assert.equal(ship.groupShipCents('amazon', 3500, null), 0);
    assert.equal(ship.groupShipCents('bestbuy', 3500, null), 0);
    assert.equal(ship.groupShipCents('nordstrom', 100, null), 0);
    assert.equal(ship.groupShipCents('lego', 3500, null), 0);
});

test('a missing arrival date is estimated as five business days, skipping the weekend', () => {
    const thursday = new Date('2026-10-15T16:00:00Z');
    assert.equal(ship.estimateArrivalDate(thursday), '2026-10-22');
    const friday = new Date('2026-10-16T16:00:00Z');
    assert.equal(ship.estimateArrivalDate(friday), '2026-10-23');
});

test('under the minimum, a printed price is kept and otherwise the standard fee is used', () => {
    assert.equal(ship.groupShipCents('walmart', 3499, null), 699);
    assert.equal(ship.groupShipCents('walmart', 3499, 799), 799);
    assert.equal(ship.groupShipCents('target', 269, null), 599);
    assert.equal(ship.groupShipCents('kohls', 2000, null), 895);
    assert.equal(ship.groupShipCents('lego', 2000, null), 495);
    assert.equal(ship.groupShipCents('lego', 3000, null), 695);
    assert.equal(ship.groupShipCents('amazon', 2000, null), 399);
    assert.equal(ship.groupShipCents('etsy', 5000, 450), 450);
    assert.equal(ship.groupShipCents('etsy', 1000, 0), 0);
});
