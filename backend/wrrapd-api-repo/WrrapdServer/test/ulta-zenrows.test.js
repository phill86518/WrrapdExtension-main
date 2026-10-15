const test = require('node:test');
const assert = require('node:assert/strict');
const retailers = require('../lib/buy/retailers');
const zenrows = require('../lib/buy/zenrows');

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
    assert.equal(JSON.stringify(page).includes('test-key-should-not-leak'), false);
    const missed = await zenrows.fetchHtml('https://www.ulta.com/p/x-pimprod1', {
        fetch: async () => ({ ok: false, status: 422, headers: { get: () => '' }, arrayBuffer: async () => Buffer.from('secret') }),
    });
    assert.equal(missed.reason, 'zenrows_http_422');
    assert.equal(missed.reason.includes('test-key'), false);
    if (previous == null) delete process.env.ZENROWS_API_KEY;
    else process.env.ZENROWS_API_KEY = previous;
});
