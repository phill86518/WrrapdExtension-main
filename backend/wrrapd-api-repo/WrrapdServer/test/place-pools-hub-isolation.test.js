/**
 * Sandbox: retailer place-pools and retailer-order recording must never
 * combine merchandise (or free shipping) across different hub addresses.
 * Uses a temp hubs file and a temp retailer-order directory. Does not touch live data.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wrrapd-pool-hubs-'));
process.env.WRRAPD_DELIVERY_HUBS_PATH = path.join(tmpRoot, 'delivery-hubs.json');

const deliveryHubs = require('../lib/delivery-hubs');
const placePools = require('../lib/buy/place-pools');
const retailerOrders = require('../lib/buy/retailer-orders');
const standardShipping = require('../lib/buy/standard-shipping');

const ATLANTA = {
    name: 'Atlanta',
    kind: 'po-box',
    addressLine1: 'PO BOX 1234',
    city: 'Atlanta',
    state: 'GA',
    postalCode: '30303',
    phone: '(404) 555-0100',
};

function paid({ id, retailer, merchCents, paidAt, hub, placement = 'to_place' }) {
    return {
        id,
        status: 'paid',
        gifteeZip: hub && (hub.postalCode || ''),
        hub,
        payment: { paidAt, gifterName: 'Test' },
        paidBill: {
            groups: [
                {
                    retailer,
                    retailerName: retailer,
                    items: [{ lineId: 'L1', cents: merchCents }],
                    shipping: { cents: 0 },
                    taxCents: 0,
                    subtotalCents: merchCents,
                },
            ],
        },
        groups: {
            [retailer]: { retailer, retailerName: retailer, placement: { state: placement } },
        },
        lines: [{ id: 'L1', retailer, state: 'ready', product: { title: `${retailer} item` } }],
    };
}

test('nearest hub is chosen per giftee ZIP before any pooling', () => {
    deliveryHubs.upsertHub(deliveryHubs.SEED_HUB);
    const atlanta = deliveryHubs.upsertHub(ATLANTA).hub;
    const jax = deliveryHubs.publicHubForZip('32256').hub;
    const atl = deliveryHubs.publicHubForZip('30309').hub;
    assert.equal(jax.hubId, 'jax-1');
    assert.equal(atl.hubId, atlanta.id);
    assert.equal(placePools.sameHub(jax, atl), false);
    assert.equal(placePools.sameHub(jax, deliveryHubs.publicHubForZip('32218').hub), true);
});

test('same retailer, different hubs: no shared cart and no shared free shipping', () => {
    const jax = deliveryHubs.publicHubForZip('32256').hub;
    const atl = deliveryHubs.publicHubForZip('30309').hub;
    const now = new Date('2026-10-16T16:30:00.000Z');
    const paidAt = '2026-10-16T15:10:00.000Z';
    const ultaFree = standardShipping.freeOverCents('ulta');
    assert.equal(ultaFree, 3500);

    const pools = placePools.buildPools(
        [
            paid({ id: 'WB-JAX1', retailer: 'ulta', merchCents: 2000, paidAt, hub: jax }),
            paid({ id: 'WB-ATL1', retailer: 'ulta', merchCents: 2000, paidAt, hub: atl }),
        ],
        { placeIntervalHours: 1, now },
    );
    assert.equal(pools.length, 2);
    for (const pool of pools) {
        assert.equal(pool.memberCount, 1);
        assert.equal(pool.merchCents, 2000);
        assert.equal(pool.freeShipMet, false);
        assert.ok(pool.shipCentsIfPlaced > 0);
    }
    assert.notEqual(pools[0].hubKey, pools[1].hubKey);
});

test('same hub address pools and can hit free shipping; a suite or street change cannot', () => {
    const jax = deliveryHubs.publicHubForZip('32256').hub;
    const jaxPretty = {
        ...jax,
        addressLine1: '150 busch dr #26067',
        city: 'jacksonville',
        state: 'fl',
        postalCode: '32218-0001',
    };
    const suite = { ...jax, addressLine2: 'UNIT 2' };
    const otherStreet = { ...jax, addressLine1: '200 MAIN ST' };
    const otherId = { ...jax, hubId: 'jax-2' };
    const now = new Date('2026-10-16T16:30:00.000Z');
    const paidAt = '2026-10-16T15:10:00.000Z';

    const pools = placePools.buildPools(
        [
            paid({ id: 'WB-A', retailer: 'ulta', merchCents: 2000, paidAt, hub: jax }),
            paid({ id: 'WB-B', retailer: 'ulta', merchCents: 1600, paidAt, hub: jaxPretty }),
            paid({ id: 'WB-C', retailer: 'ulta', merchCents: 5000, paidAt, hub: suite }),
            paid({ id: 'WB-D', retailer: 'ulta', merchCents: 5000, paidAt, hub: otherStreet }),
            paid({ id: 'WB-E', retailer: 'ulta', merchCents: 5000, paidAt, hub: otherId }),
        ],
        { placeIntervalHours: 1, now },
    );

    const together = pools.find((p) => p.batchIds.includes('WB-A'));
    assert.ok(together.batchIds.includes('WB-B'));
    assert.equal(together.memberCount, 2);
    assert.equal(together.merchCents, 3600);
    assert.equal(together.freeShipMet, true);
    assert.equal(together.shipCentsIfPlaced, 0);
    assert.equal(together.status, 'ready_threshold');

    for (const id of ['WB-C', 'WB-D', 'WB-E']) {
        const pool = pools.find((p) => p.batchIds.includes(id));
        assert.equal(pool.memberCount, 1);
        assert.equal(pool.batchIds[0], id);
        assert.notEqual(pool.hubKey, together.hubKey);
    }
});

test('stress: many retailers and hubs never cross free-shipping totals', () => {
    const jax = deliveryHubs.publicHubForZip('32256').hub;
    const atl = deliveryHubs.publicHubForZip('30309').hub;
    const miami = {
        hubId: 'mia-1',
        displayName: 'Miami',
        addressLine1: '1 BISCAYNE BLVD',
        addressLine2: '',
        city: 'MIAMI',
        state: 'FL',
        postalCode: '33132',
    };
    const orphan = { displayName: 'Nowhere' };
    const hubs = [jax, atl, miami];
    const retailers = ['ulta', 'kohls', 'target', 'walmart', 'amazon', 'sephora'];
    const rows = [];
    let n = 0;
    for (const retailer of retailers) {
        for (const hub of hubs) {
            for (let i = 0; i < 3; i++) {
                n += 1;
                rows.push(
                    paid({
                        id: `WB-S${String(n).padStart(4, '0')}`,
                        retailer,
                        merchCents: 1000,
                        paidAt: '2026-10-16T15:00:00.000Z',
                        hub,
                    }),
                );
            }
        }
        rows.push(
            paid({
                id: `WB-ORPHAN-${retailer}`,
                retailer,
                merchCents: 9900,
                paidAt: '2026-10-16T15:00:00.000Z',
                hub: orphan,
            }),
        );
    }

    const now = new Date('2026-10-16T16:00:00.000Z');
    const pools = placePools.buildPools(rows, { placeIntervalHours: 1, now });
    const seen = new Set();
    for (const pool of pools) {
        assert.equal(seen.has(pool.poolKey), false);
        seen.add(pool.poolKey);
        const memberHubs = new Set(
            pool.batchIds.map((id) => {
                const row = rows.find((r) => r.id === id);
                return placePools.hubKey(row.hub);
            }),
        );
        assert.equal(memberHubs.size, 1);
        const hubKey = [...memberHubs][0];
        const expectedMerch = rows
            .filter((r) => r.groups[pool.retailer] && placePools.hubKey(r.hub) === hubKey && pool.batchIds.includes(r.id))
            .reduce((s, r) => s + 1, 0);
        assert.equal(pool.memberCount, pool.batchIds.length);
        assert.equal(pool.merchCents, pool.memberCount * (hubKey === 'unknown' ? 9900 : 1000));
        assert.equal(expectedMerch, pool.memberCount);
        const freeOver = standardShipping.freeOverCents(pool.retailer);
        const expectFree = freeOver != null && pool.merchCents >= freeOver;
        assert.equal(pool.freeShipMet, expectFree);
        if (hubKey === 'unknown') assert.equal(pool.memberCount, 1);
        else assert.equal(pool.memberCount, 3);
        if (!expectFree && freeOver != null) assert.ok(pool.shipCentsIfPlaced > 0);
        if (expectFree) assert.equal(pool.shipCentsIfPlaced, 0);
    }

    const ultaPools = pools.filter((p) => p.retailer === 'ulta');
    assert.equal(ultaPools.length, 4);
    const ultaMerch = ultaPools.reduce((s, p) => s + p.merchCents, 0);
    assert.equal(ultaMerch, 3 * 3 * 1000 + 9900);
    assert.equal(ultaPools.filter((p) => p.freeShipMet).length, 1);
    assert.equal(ultaPools.find((p) => p.freeShipMet).memberCount, 1);
});

test('recording a retailer checkout refuses mixed hubs and a later add from another hub', () => {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'ro-'));
    retailerOrders.setDirForTests(dir);
    const jax = deliveryHubs.publicHubForZip('32256').hub;
    const atl = deliveryHubs.publicHubForZip('30309').hub;
    const a = paid({ id: 'WB-REC-A', retailer: 'ulta', merchCents: 2000, paidAt: '2026-10-16T15:00:00.000Z', hub: jax });
    const b = paid({ id: 'WB-REC-B', retailer: 'ulta', merchCents: 2000, paidAt: '2026-10-16T15:00:00.000Z', hub: atl });
    const mixed = retailerOrders.recordPlacement({
        retailerId: 'ulta',
        retailerOrderNumber: 'MIX-1',
        retailerTotalCents: 4000,
        arrivalDate: '2026-10-21',
        batches: [a, b],
        by: 'sandbox',
    });
    assert.equal(mixed.ok, false);
    assert.match(mixed.error, /different hubs/i);

    const ok = retailerOrders.recordPlacement({
        retailerId: 'ulta',
        retailerOrderNumber: 'JAX-1',
        retailerTotalCents: 2000,
        arrivalDate: '2026-10-21',
        batches: [a],
        by: 'sandbox',
    });
    assert.equal(ok.ok, true, ok.error);
    const sneak = retailerOrders.recordPlacement({
        retailerId: 'ulta',
        retailerOrderNumber: 'JAX-1',
        retailerTotalCents: 2000,
        arrivalDate: '2026-10-21',
        batches: [b],
        by: 'sandbox',
    });
    assert.equal(sneak.ok, false);
    assert.match(sneak.error, /different hub/i);
    assert.equal(retailerOrders.read(ok.order.id).members.length, 1);
});
