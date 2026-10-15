const test = require('node:test');
const assert = require('node:assert/strict');
const manual = require('../lib/buy/manual');
const accountOrders = require('../lib/buy/account-orders');

const hub = { displayName: 'Jacksonville', postalCode: '32202', state: 'FL', city: 'Jacksonville' };

function line(over) {
    return { id: 'L4', url: 'https://www.kohls.com/product/prd-7513461/x.jsp?skuId=50653163', retailer: 'kohls', retailerName: "Kohl's", state: 'unavailable', reason: 'zenrows_timeout', qty: 1, ...over };
}

test('read failures can be added by hand; shopper mistakes and limits cannot', () => {
    for (const reason of ['zenrows_timeout', 'read_timeout', 'timeout', 'blocked', 'http_403', 'quote_timeout', 'fetch_failed: x', 'no_title']) {
        assert.equal(manual.canAsk(line({ reason })), true, reason);
    }
    for (const reason of ['product_list', 'not_a_product_page', 'out_of_stock', 'over_item_limit', 'electronics_blocked', 'desk_unavailable', 'ship_zip']) {
        assert.equal(manual.canAsk(line({ reason })), false, reason);
    }
    assert.equal(manual.canAsk(line({ retailer: 'none' })), false);
    assert.equal(manual.canAsk(line({ removed: true })), false);
    assert.equal(manual.canAsk(line({ manual: { state: 'requested' } })), false);
    assert.equal(manual.shopperState(line()), 'available');
    assert.equal(manual.shopperState(line({ manual: { state: 'requested' } })), 'requested');
    assert.equal(manual.shopperState(line({ reason: 'product_list' })), '');
});

test('only-item check ignores removed and excluded lines', () => {
    const b = { lines: [line(), { id: 'L1', state: 'unavailable' }, { id: 'L2', state: 'ready', removed: true }] };
    assert.equal(manual.otherActive(b, 'L4'), 0);
    b.lines.push({ id: 'L3', state: 'ready' });
    assert.equal(manual.otherActive(b, 'L4'), 1);
});

function paidBatch() {
    return {
        id: 'WB-ABCDEFGHJK',
        status: 'paid',
        createdAt: '2026-10-15T12:00:00.000Z',
        gifteeZip: '32202',
        hub,
        lines: [
            { id: 'L1', retailer: 'ulta', state: 'ready', product: { title: 'Perfume', imageUrl: 'https://x/p.jpg' }, wrap: { occasion: 'Birthday', style: 'wrrapd', giftMessage: 'Love you', senderName: 'Phill', done: true, flowers: { offerId: 'f1', amount: 40 } } },
            line(),
        ],
        paidBill: {
            groups: [{ retailer: 'ulta', retailerName: 'Ulta Beauty', items: [{ lineId: 'L1', title: 'Perfume', variant: '6.7 oz', imageUrl: 'https://x/p.jpg', cents: 5800 }], shipping: { cents: 0, arrivalDate: '2026-10-20' }, taxCents: 435 }],
            wrap: { giftWrapCents: 899, discountCents: 0, designAiCents: 0, designUploadCents: 0, flowersCents: 0, boxCents: 0, serviceTaxCents: 67 },
            totalCents: 7201,
        },
        payment: { transactionId: 't1', amountCents: 7201, paidAt: '2026-10-15T12:30:00.000Z', gifterName: 'Phill', email: 'p@example.com', emailNorm: 'p@example.com', giftee: { name: 'Ann' } },
        placements: {},
        refunds: [],
    };
}

test('wrap for an add-on copies the order wrap without flowers', () => {
    const w = manual.wrapFromOrder(paidBatch());
    assert.deepEqual(w, { occasion: 'Birthday', style: 'wrrapd', giftMessage: 'Love you', senderName: 'Phill', done: true });
});

test('add-on price: item x qty, standard shipping, hub tax, and gift-wrap', () => {
    const b = paidBatch();
    const out = manual.priceAddOn(b, b.lines[1], { title: 'LifeStride London 3', priceUsd: '39.99', qty: 1, variantLabel: 'Size: 8, Color: Black' }, { perItemCapCents: 50000 });
    assert.equal(out.ok, true, out.error);
    const a = out.addOn;
    assert.equal(a.item.cents, 3999);
    assert.equal(a.shipping.cents, 895);
    assert.equal(a.retailerCents, 3999 + 895 + a.taxCents);
    assert.ok(a.taxCents > 0);
    assert.ok(a.wrapBill.totalCents > 0);
    assert.equal(a.totalCents, a.retailerCents + a.wrapBill.totalCents);
    assert.equal(a.item.variant, 'Size: 8, Color: Black');
    const two = manual.priceAddOn(b, b.lines[1], { title: 'Shoe', priceUsd: '30', qty: 2 }, { perItemCapCents: 50000 });
    assert.equal(two.addOn.item.cents, 6000);
    assert.equal(two.addOn.shipping.cents, 0);
    const given = manual.priceAddOn(b, b.lines[1], { title: 'Shoe', priceUsd: '30', shippingCents: 0 }, { perItemCapCents: 50000 });
    assert.equal(given.addOn.shipping.cents, 0);
});

test('add-on price refuses missing price, the per-item limit, and unknown shipping', () => {
    const b = paidBatch();
    assert.equal(manual.priceAddOn(b, b.lines[1], { title: 'Shoe' }, { perItemCapCents: 50000 }).ok, false);
    assert.equal(manual.priceAddOn(b, b.lines[1], { title: 'Shoe', priceUsd: '600' }, { perItemCapCents: 50000 }).ok, false);
    const amazon = line({ retailer: 'amazon' });
    const r = manual.priceAddOn(b, amazon, { title: 'Book', priceUsd: '12' }, { perItemCapCents: 50000 });
    assert.equal(r.ok, false);
    assert.match(r.error, /shipping/i);
});

test('admin row moves an in-cart item to paid with the order and placed', () => {
    const b = paidBatch();
    b.lines[1].manual = { state: 'in_cart', requestedAt: '2026-10-15T12:10:00.000Z' };
    b.lines[1].retailer = 'ulta';
    b.paidBill.groups[0].items.push({ lineId: 'L4', title: 'Shoe', cents: 3999 });
    assert.equal(manual.adminRow(b, b.lines[1]).state, 'paid_with_order');
    b.placements.ulta = { state: 'placed' };
    assert.equal(manual.adminRow(b, b.lines[1]).state, 'placed');
});

test('My orders shows a paid buy-for-you order with its paid add-on', () => {
    const b = paidBatch();
    const priced = manual.priceAddOn(b, b.lines[1], { title: 'LifeStride London 3', priceUsd: '39.99' }, { perItemCapCents: 50000 });
    b.addOns = [{ ...priced.addOn, id: 'A1', state: 'paid', payment: { amountCents: priced.addOn.totalCents, paidAt: '2026-10-16T10:00:00.000Z' } }];
    const rows = accountOrders.forEmail('p@example.com', [b, { ...paidBatch(), id: 'WB-OTHER00000', payment: { ...paidBatch().payment, emailNorm: 'x@example.com' } }]);
    assert.equal(rows.length, 1);
    const o = rows[0];
    assert.equal(o.orderNumber, 'WB-ABCDEFGHJK');
    assert.equal(o.payment.amount, 7201 + priced.addOn.totalCents);
    assert.equal(o.payment.status, 'succeeded');
    assert.equal(o.lines.length, 2);
    assert.equal(o.lines[0].productTitle, 'Perfume (6.7 oz)');
    assert.equal(o.lines[0].gifteeName, 'Ann');
    assert.equal(o.lines[0].deliveryHint, '2026-10-21');
    assert.equal(o.lines[1].productTitle, 'LifeStride London 3');
    assert.ok(o.checkoutInvoice.lines.some((r) => /^Added item: LifeStride/.test(r.label)));
    assert.deepEqual(accountOrders.forEmail('', [b]), []);
});
