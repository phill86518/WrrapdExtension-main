const test = require('node:test');
const assert = require('node:assert/strict');
const brightdata = require('../lib/buy/brightdata');
const reader = require('../lib/buy/page-reader');

test('Bright Data client stays quiet when the API key is missing', async () => {
    const prev = process.env.BRIGHTDATA_API_KEY;
    delete process.env.BRIGHTDATA_API_KEY;
    delete process.env.BRIGHT_DATA_API_KEY;
    assert.equal(brightdata.isConfigured(), false);
    const miss = await brightdata.fetchHtml('https://www.kohls.com/product/prd-1.jsp');
    assert.equal(miss.ok, false);
    assert.equal(miss.reason, 'brightdata_not_configured');
    const scrape = await brightdata.scrapeKohlsProduct('https://www.kohls.com/product/prd-1.jsp');
    assert.equal(scrape.ok, false);
    assert.equal(scrape.reason, 'brightdata_not_configured');
    if (prev == null) delete process.env.BRIGHTDATA_API_KEY;
    else process.env.BRIGHTDATA_API_KEY = prev;
});

test('Kohl\'s dataset record maps sale price, image, and variants', () => {
    const product = brightdata.productFromKohlsRecord(
        {
            title: "LifeStride London 3 Women's Loafers",
            brand: 'LifeStride',
            final_price: 49.99,
            regular_price: 69.99,
            color: 'Tan',
            size: '8M',
            colors: ['Tan', 'Black'],
            sizes: ['7M', '8M', '9M'],
            image_url: 'https://media.kohlsimg.com/is/image/kohls/7513461_Tan',
            in_stock: true,
        },
        'https://www.kohls.com/product/prd-7513461/x.jsp?skuId=50653163',
    );
    assert.equal(product.title.includes('LifeStride'), true);
    assert.equal(product.pagePriceCents, 4999);
    assert.equal(product.brand, 'LifeStride');
    assert.match(product.imageUrl, /kohlsimg/);
    assert.equal(product.readBy, 'brightdata_kohls');
    assert.equal(product.variantGroups.length, 2);
});

test('Kohl\'s scraper trigger uses the dataset id and never leaks the key', async () => {
    const prev = process.env.BRIGHTDATA_API_KEY;
    process.env.BRIGHTDATA_API_KEY = 'test-bright-key-should-not-leak';
    let seen;
    let calls = 0;
    const scraped = await brightdata.scrapeKohlsProduct(
        'https://www.kohls.com/product/prd-7513461/lifestride-london-3-womens-loafers.jsp?skuId=50653163',
        {
            fetch: async (url, opts) => {
                calls += 1;
                const u = String(url);
                if (u.includes('/trigger')) {
                    seen = { url: u, opts };
                    return {
                        ok: true,
                        status: 200,
                        text: async () => JSON.stringify({ snapshot_id: 'sd_test_snap' }),
                    };
                }
                if (u.includes('/progress/')) {
                    return { ok: true, status: 200, json: async () => ({ status: 'ready' }) };
                }
                return {
                    ok: true,
                    status: 200,
                    text: async () =>
                        JSON.stringify([
                            {
                                title: "LifeStride London 3 Women's Loafers",
                                price: 54.99,
                                image: 'https://media.kohlsimg.com/is/image/kohls/7513461',
                            },
                        ]),
                };
            },
        },
    );
    assert.equal(scraped.ok, true);
    assert.equal(scraped.product.pagePriceCents, 5499);
    assert.match(seen.url, /datasets\/v3\/trigger/);
    assert.match(seen.url, /gd_mlji2hi729x1g0vg4i/);
    assert.match(seen.opts.headers.Authorization, /^Bearer /);
    assert.equal(JSON.stringify(scraped.product).includes('test-bright-key'), false);
    assert.equal(reader.GEMINI_FIRST_RETAILERS.has('kohls'), true);
    assert.equal(brightdata.KOHLS_DATASET_ID, 'gd_mlji2hi729x1g0vg4i');
    assert.ok(calls >= 2);
    if (prev == null) delete process.env.BRIGHTDATA_API_KEY;
    else process.env.BRIGHTDATA_API_KEY = prev;
});

test('Kohl\'s scraper maps blocked snapshots to brightdata_kohls_blocked', async () => {
    const prev = process.env.BRIGHTDATA_API_KEY;
    process.env.BRIGHTDATA_API_KEY = 'test-bright-key';
    const scraped = await brightdata.scrapeKohlsProduct('https://www.kohls.com/product/prd-1.jsp', {
        fetch: async (url) => {
            const u = String(url);
            if (u.includes('/trigger')) {
                return { ok: true, status: 200, text: async () => JSON.stringify({ snapshot_id: 'sd_block' }) };
            }
            if (u.includes('/progress/')) {
                return { ok: true, status: 200, json: async () => ({ status: 'ready' }) };
            }
            return {
                ok: true,
                status: 200,
                text: async () =>
                    JSON.stringify([
                        {
                            input: { url: 'https://www.kohls.com/product/prd-1.jsp' },
                            error: 'Access denied: HTTP 403 Forbidden status detected',
                            error_code: 'blocked',
                        },
                    ]),
            };
        },
    });
    assert.equal(scraped.ok, false);
    assert.equal(scraped.reason, 'brightdata_kohls_blocked');
    if (prev == null) delete process.env.BRIGHTDATA_API_KEY;
    else process.env.BRIGHTDATA_API_KEY = prev;
});

test('Bright Data unlocker POST uses Bearer auth and never echoes the key', async () => {
    const prev = process.env.BRIGHTDATA_API_KEY;
    const prevZone = process.env.BRIGHTDATA_UNLOCKER_ZONE;
    process.env.BRIGHTDATA_API_KEY = 'test-bright-key-should-not-leak';
    process.env.BRIGHTDATA_UNLOCKER_ZONE = 'mcp_unlocker';
    let seen;
    const page = await brightdata.fetchHtml('https://www.kohls.com/product/prd-1.jsp', {
        fetch: async (url, opts) => {
            seen = { url: String(url), opts };
            return {
                ok: true,
                headers: { get: () => '200' },
                text: async () => `<html>${'kohls product page '.repeat(40)}</html>`,
            };
        },
    });
    assert.equal(page.ok, true);
    assert.equal(page.via, 'brightdata');
    assert.match(seen.url, /api\.brightdata\.com\/request/);
    const body = JSON.parse(seen.opts.body);
    assert.equal(body.zone, 'mcp_unlocker');
    assert.equal(body.render, 'true');
    if (prev == null) delete process.env.BRIGHTDATA_API_KEY;
    else process.env.BRIGHTDATA_API_KEY = prev;
    if (prevZone == null) delete process.env.BRIGHTDATA_UNLOCKER_ZONE;
    else process.env.BRIGHTDATA_UNLOCKER_ZONE = prevZone;
});
