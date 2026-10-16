const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const retailerOrders = require('../lib/buy/retailer-orders');

function paidBatch({ id, retailer, merchCents, shipCents = 0, taxCents = 100, hubZip = '32256' }) {
    const subtotal = merchCents + shipCents + taxCents;
    return {
        id,
        status: 'paid',
        gifteeZip: hubZip,
        hub: { displayName: 'Jax hub', postalCode: hubZip, addressLine1: '150 BUSCH DR #26067' },
        payment: { paidAt: '2026-10-16T12:00:00.000Z', gifterName: 'Pat' },
        paidBill: {
            groups: [
                {
                    retailer,
                    retailerName: retailer,
                    items: [{ lineId: 'L1', title: `${retailer} item`, cents: merchCents }],
                    shipping: { cents: shipCents, arrivalDate: '2026-10-20' },
                    taxCents,
                    subtotalCents: subtotal,
                },
            ],
        },
        groups: {
            [retailer]: { retailer, retailerName: retailer, placement: { state: 'to_place' } },
        },
        lines: [{ id: 'L1', retailer, state: 'ready', product: { title: `${retailer} item` } }],
    };
}

test('maps multiple customer batches onto one retailer checkout', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ro-'));
    retailerOrders.setDirForTests(dir);
    const a = paidBatch({ id: 'WB-AAAAAAAAAA', retailer: 'ulta', merchCents: 2000, shipCents: 695 });
    const b = paidBatch({ id: 'WB-BBBBBBBBBB', retailer: 'ulta', merchCents: 1800, shipCents: 695 });
    const out = retailerOrders.recordPlacement({
        retailerId: 'ulta',
        retailerOrderNumber: 'U-998877',
        retailerTotalCents: 4600,
        arrivalDate: '2026-10-21',
        batches: [a, b],
        by: 'tester',
        poolKey: 'ulta::32256|150 BUSCH DR #26067',
    });
    assert.equal(out.ok, true, out.error);
    assert.match(out.order.id, /^RO-/);
    assert.equal(out.order.retailerOrderNumber, 'U-998877');
    assert.equal(out.order.members.length, 2);
    assert.equal(out.order.poolKey.includes('ulta'), true);
    const view = retailerOrders.publicView(out.order);
    assert.equal(view.memberCount, 2);
    assert.equal(view.merchCents, 3800);
    const again = retailerOrders.findByRetailerRef('ulta', 'u-998877');
    assert.equal(again.id, out.order.id);
});

test('refuses a retailer total above what shoppers paid across the pool', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ro-'));
    retailerOrders.setDirForTests(dir);
    const a = paidBatch({ id: 'WB-CCCCCCCCCC', retailer: 'ulta', merchCents: 2000, shipCents: 0, taxCents: 150 });
    const out = retailerOrders.recordPlacement({
        retailerId: 'ulta',
        retailerOrderNumber: 'TOO-HIGH',
        retailerTotalCents: 99999,
        arrivalDate: '2026-10-21',
        batches: [a],
        by: 'tester',
    });
    assert.equal(out.ok, false);
    assert.match(out.error, /higher/i);
});

test('backfill creates registry rows from legacy placements', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ro-'));
    retailerOrders.setDirForTests(dir);
    const b = paidBatch({ id: 'WB-DDDDDDDDDD', retailer: 'kohls', merchCents: 4799, shipCents: 895, taxCents: 400 });
    b.placements = {
        kohls: {
            state: 'placed',
            retailerOrderNumber: 'K-12345',
            retailerTotalCents: 6094,
            arrivalDate: '2026-10-22',
            placedAt: '2026-10-16T15:00:00.000Z',
            by: 'legacy',
        },
    };
    const created = retailerOrders.backfillFromBatches([b]);
    assert.equal(created.length, 1);
    assert.equal(created[0].retailerOrderNumber, 'K-12345');
    assert.equal(created[0].members[0].batchId, 'WB-DDDDDDDDDD');
});
