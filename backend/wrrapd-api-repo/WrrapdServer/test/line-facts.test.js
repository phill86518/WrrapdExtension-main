const test = require('node:test');
const assert = require('node:assert/strict');
const facts = require('../lib/buy/line-facts');

test('pasting the same item again raises the quantity up to 10', () => {
    assert.deepEqual(facts.bumpQty(1, 1), { qty: 2, notice: 'You already have this item. Quantity is now 2.' });
    assert.equal(facts.bumpQty(10, 1).qty, 10);
    assert.equal(facts.bumpQty(10, 1).notice, 'You already have 10 of this item.');
    assert.equal(facts.noticeFor(['You already have this item. Quantity is now 2.', 'You already have this item. Quantity is now 3.']), 'You already have these items. Quantities were increased.');
});

test('selected size and color are shown without the group names', () => {
    assert.equal(facts.variantPhrase([
        { name: 'Size', options: ['Small', 'Large'], selected: 'Small' },
        { name: 'Color', options: ['Black', 'White'], selected: 'Black' },
    ]), 'Small, Black');
    assert.equal(facts.variantPhrase([
        { name: 'Size', options: ['Small', 'Large'], selected: null },
        { name: 'Color', options: ['Black'], selected: 'Black' },
    ]), 'Black');
});
