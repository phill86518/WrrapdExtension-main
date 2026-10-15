const test = require('node:test');
const assert = require('node:assert/strict');
const retailers = require('../lib/buy/retailers');
const zenrows = require('../lib/buy/zenrows');
const reader = require('../lib/buy/page-reader');

test('a page read gives up on our own fetch after 10 seconds', () => {
    assert.equal(reader.DIRECT_MS, 10000);
    assert.equal(zenrows.TIMEOUT_MS, 90000);
    assert.equal(reader.usablePage({ ok: false, html: 'x'.repeat(30000) }), false);
    assert.equal(reader.usablePage({ ok: true, html: 'captcha ' + 'x'.repeat(1000) }), false);
    assert.equal(reader.usablePage({ ok: true, html: 'product '.repeat(4000) }), true);
});

test('an Ulta shade link stays one product, and a different shade is a different item', () => {
    const a = retailers.parseProductLink('https://www.ulta.com/p/soft-pinch-pimprod2007109?sku=2551199');
    const b = retailers.parseProductLink('https://www.ulta.com/p/soft-pinch-pimprod2007109?sku=2551200');
    assert.equal(a.ok, true);
    assert.notEqual(a.canonicalUrl, b.canonicalUrl);
    assert.match(a.url, /sku=2551199/);
    const balm = retailers.parseProductLink('https://www.ulta.com/p/take-day-off-cleansing-balm-makeup-remover-xlsImpprod11771009?sku=2590281');
    assert.equal(balm.ok, true);
    assert.match(balm.canonicalUrl, /xlsimpprod11771009\?sku=2590281/);
});

test('Ulta page reads go through ZenRows and errors do not include the key', async () => {
    const previous = process.env.ZENROWS_API_KEY;
    process.env.ZENROWS_API_KEY = 'test-key-should-not-leak';
    const seen = [];
    const page = await zenrows.fetchHtml('https://www.ulta.com/p/soft-pinch-pimprod2007109?sku=2551199', {
        fetch: async (api) => {
            seen.push(String(api));
            return {
                ok: true,
                headers: { get: (name) => (name === 'zr-final-url' ? 'https://www.ulta.com/p/soft-pinch-pimprod2007109?sku=2551199' : '') },
                arrayBuffer: async () => Buffer.from('<html>' + 'ulta product page '.repeat(40) + '</html>'),
            };
        },
    });
    assert.equal(page.ok, true);
    assert.match(seen[0], /api\.zenrows\.com/);
    assert.match(seen[0], /ulta\.com/);
    assert.match(seen[0], /wait_for=h1/);
    assert.equal(seen.length, 1);
    assert.equal(JSON.stringify(page).includes('test-key-should-not-leak'), false);
    const missed = await zenrows.fetchHtml('https://www.ulta.com/p/x-pimprod1', {
        fetch: async () => ({ ok: false, status: 422, headers: { get: () => '' }, arrayBuffer: async () => Buffer.from('secret') }),
    });
    assert.equal(missed.reason, 'zenrows_http_422');
    assert.equal(missed.reason.includes('test-key'), false);
    const tries = [];
    const noHeading = await zenrows.fetchHtml('https://www.kohls.com/product/prd-1.jsp', {
        fetch: async (api) => {
            tries.push(String(api));
            if (tries.length === 1) return { ok: false, status: 422, headers: { get: () => '' }, arrayBuffer: async () => Buffer.from('') };
            return { ok: true, headers: { get: () => '' }, arrayBuffer: async () => Buffer.from('<html>' + 'kohls page '.repeat(80) + '</html>') };
        },
    });
    assert.equal(noHeading.ok, true);
    assert.equal(tries.length, 2);
    assert.doesNotMatch(tries[1], /wait_for/);
    if (previous == null) delete process.env.ZENROWS_API_KEY;
    else process.env.ZENROWS_API_KEY = previous;
});
