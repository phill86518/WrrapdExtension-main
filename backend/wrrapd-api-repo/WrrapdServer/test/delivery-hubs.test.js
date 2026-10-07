const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrrapd-hubs-'));
process.env.WRRAPD_DELIVERY_HUBS_PATH = path.join(tmpDir, 'delivery-hubs.json');
const hubs = require('../lib/delivery-hubs');

const ATLANTA = {
    name: 'Atlanta',
    kind: 'po-box',
    addressLine1: 'PO BOX 1234',
    city: 'Atlanta',
    state: 'GA',
    postalCode: '30303',
    phone: '(404) 555-0100',
};

test('missing file falls back to the Jacksonville hub', () => {
    const pick = hubs.publicHubForZip('30303');
    assert.equal(pick.hub.hubId, 'jax-1');
    assert.equal(pick.hub.addressLine1, '150 BUSCH DR #26067');
    assert.equal(pick.hub.postalCode, '32218');
    assert.deepEqual(pick.hub.shipLines, ['WRRAPD INC', '150 BUSCH DR #26067', 'JACKSONVILLE FL 32218']);
});

test('nearest active hub wins; unknown ZIP uses the default hub', () => {
    hubs.upsertHub(hubs.SEED_HUB);
    const { hub } = hubs.upsertHub(ATLANTA);
    assert.equal(hub.city, 'ATLANTA');
    assert.equal(hub.recipientFirstName, 'WRRAPD');

    assert.equal(hubs.publicHubForZip('30309').hub.hubId, hub.id);
    assert.equal(hubs.publicHubForZip('31401').hub.hubId, 'jax-1');
    assert.equal(hubs.publicHubForZip('32256').hub.hubId, 'jax-1');
    assert.equal(hubs.publicHubForZip('00000').hub.hubId, 'jax-1');
    assert.equal(hubs.publicHubForZip('').hub.hubId, 'jax-1');
    assert.equal(hubs.checkZip('30309').matched, 'nearest');

    hubs.setHubActive(hub.id, false);
    assert.equal(hubs.publicHubForZip('30309').hub.hubId, 'jax-1');
    hubs.setHubActive(hub.id, true);

    const report = hubs.getAdminReport(['30303', '30309', '32218', '32256']);
    const served = Object.fromEntries(report.hubs.map((h) => [h.id, h.servedAllowedZipCount]));
    assert.equal(served['jax-1'], 2);
    assert.equal(served[hub.id], 2);
});

test('cannot remove or pause the last active hub', () => {
    const { hubs: list } = hubs.loadHubs({ force: true });
    for (const h of list.filter((x) => x.id !== 'jax-1')) hubs.removeHub(h.id);
    assert.throws(() => hubs.removeHub('jax-1'), /at least one active hub/);
    assert.throws(() => hubs.setHubActive('jax-1', false), /at least one active hub/);
});

test('rejects incomplete or unmappable addresses', () => {
    assert.throws(() => hubs.upsertHub({ addressLine1: 'PO BOX 1', city: 'X', state: 'ZZ', postalCode: '30303' }));
    assert.throws(() => hubs.upsertHub({ addressLine1: 'PO BOX 1', city: 'X', state: 'GA', postalCode: '00000' }), /ZIP location index/);
});

test('recognizes any hub address on an order', () => {
    assert.equal(hubs.isHubAddress({ street: '150 Busch Dr #26067', postalCode: '32218' }), true);
    assert.equal(hubs.isHubAddress({ street: '12 Oak St', postalCode: '32218' }), false);
});

test.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
