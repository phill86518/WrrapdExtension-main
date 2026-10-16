const test = require('node:test');
const assert = require('node:assert/strict');
const placePools = require('../lib/buy/place-pools');
const standardShipping = require('../lib/buy/standard-shipping');

function batch({ id, retailer, merchCents, paidAt, hubZip = '32256', placement = 'to_place' }) {
    return {
        id,
        status: 'paid',
        hub: { displayName: 'Jax hub', postalCode: hubZip, addressLine1: '150 BUSCH DR #26067' },
        payment: { paidAt, gifterName: 'Test' },
        paidBill: {
            groups: [
                {
                    retailer,
                    items: [{ lineId: 'L1', cents: merchCents }],
                    shipping: { cents: 0 },
                    taxCents: 0,
                },
            ],
        },
        groups: {
            [retailer]: {
                retailer,
                retailerName: retailer,
                placement: { state: placement },
            },
        },
        lines: [
            {
                id: 'L1',
                retailer,
                state: 'ready',
                product: { title: `${retailer} item` },
            },
        ],
    };
}

test('ulta free-shipping threshold is $35', () => {
    assert.equal(standardShipping.freeOverCents('ulta'), 3500);
    assert.equal(standardShipping.freeOverCents('nordstrom'), 0);
    assert.equal(standardShipping.freeOverCents('kohls'), 4900);
});

test('pools same retailer+hub and marks ready when free-ship threshold is met', () => {
    const now = new Date('2026-10-16T16:30:00.000Z'); // mid-hour
    const pools = placePools.buildPools(
        [
            batch({ id: 'WB-AAAAAAAAAA', retailer: 'ulta', merchCents: 2000, paidAt: '2026-10-16T15:10:00.000Z' }),
            batch({ id: 'WB-BBBBBBBBBB', retailer: 'ulta', merchCents: 1600, paidAt: '2026-10-16T15:40:00.000Z' }),
        ],
        { placeIntervalHours: 1, now },
    );
    assert.equal(pools.length, 1);
    assert.equal(pools[0].merchCents, 3600);
    assert.equal(pools[0].freeShipMet, true);
    assert.equal(pools[0].status, 'ready_threshold');
    assert.equal(pools[0].shipCentsIfPlaced, 0);
    assert.equal(pools[0].memberCount, 2);
});

test('under threshold stays accumulating until schedule due', () => {
    const paidAt = '2026-10-16T14:17:00.000Z';
    const dueAt = placePools.nextDueAt(paidAt, 1);
    const before = new Date(Date.parse(dueAt) - 60 * 1000);
    const after = new Date(Date.parse(dueAt) + 60 * 1000);
    const rows = [batch({ id: 'WB-CCCCCCCCCC', retailer: 'ulta', merchCents: 2000, paidAt })];

    const waiting = placePools.buildPools(rows, { placeIntervalHours: 1, now: before });
    assert.equal(waiting[0].status, 'accumulating');
    assert.equal(waiting[0].freeShipMet, false);
    assert.equal(waiting[0].actionable, false);

    const due = placePools.buildPools(rows, { placeIntervalHours: 1, now: after });
    assert.equal(due[0].status, 'due_schedule');
    assert.equal(due[0].actionable, true);
    assert.ok(due[0].shipCentsIfPlaced > 0);
});

test('different hubs do not pool together', () => {
    const now = new Date('2026-10-16T20:00:00.000Z');
    const pools = placePools.buildPools(
        [
            batch({ id: 'WB-DDDDDDDDDD', retailer: 'ulta', merchCents: 2000, paidAt: '2026-10-16T15:00:00.000Z', hubZip: '32256' }),
            batch({
                id: 'WB-EEEEEEEEEE',
                retailer: 'ulta',
                merchCents: 2000,
                paidAt: '2026-10-16T15:00:00.000Z',
                hubZip: '32003',
            }),
        ],
        { placeIntervalHours: 1, now },
    );
    assert.equal(pools.length, 2);
});

test('two-hour interval lands on even Eastern hours', () => {
    // 2026-10-16 14:17 UTC = 10:17 ET (EDT)
    const due = placePools.nextDueAt('2026-10-16T14:17:00.000Z', 2);
    const p = placePools.etParts(new Date(due));
    assert.equal(p.min, 0);
    assert.equal(p.sec, 0);
    assert.equal(p.h % 2, 0);
    assert.ok(p.h >= 12); // next even after 11 would be 12
});
