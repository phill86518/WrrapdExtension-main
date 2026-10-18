/**
 * Bright Data for hard retailers (especially Kohl's):
 * 1) Pre-built Kohl's Products scraper (dataset) → structured price/title
 * 2) Web Unlocker → raw HTML when we need to parse ourselves
 *
 * Same API token as Cursor MCP (scripts/run-brightdata-mcp.js).
 */
const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 90000;
const SCRAPE_TIMEOUT_MS = 70000;
const KOHLS_DATASET_ID =
    process.env.BRIGHTDATA_KOHLS_DATASET_ID || 'gd_mlji2hi729x1g0vg4i';

function apiKey() {
    return String(process.env.BRIGHTDATA_API_KEY || process.env.BRIGHT_DATA_API_KEY || '').trim();
}

function unlockerZone() {
    return String(
        process.env.BRIGHTDATA_UNLOCKER_ZONE || process.env.BRIGHT_DATA_UNLOCKER_ZONE || 'mcp_unlocker',
    ).trim();
}

function isConfigured() {
    return apiKey().length > 0;
}

/** Bright Data Kohl's prices are dollars (29.99 or "$29.99"). */
function moneyToCents(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.round(value * 100);
    }
    const s = String(value).replace(/,/g, '').trim();
    const m = s.match(/(\d+(?:\.\d{1,2})?)/);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100);
}

function pickCents(row, keys) {
    for (const key of keys) {
        if (row[key] == null || row[key] === '') continue;
        const c = moneyToCents(row[key]);
        if (c != null && c > 0) return c;
    }
    return null;
}

function pickString(row, keys) {
    for (const key of keys) {
        const v = row[key];
        if (v == null) continue;
        const s = String(v).trim();
        if (s) return s;
    }
    return '';
}

function firstImage(row) {
    const direct = pickString(row, ['image', 'image_url', 'imageUrl', 'main_image', 'thumbnail', 'img']);
    if (direct && /^https?:\/\//i.test(direct)) return direct.slice(0, 1000);
    for (const key of ['images', 'image_urls', 'photos']) {
        const v = row[key];
        if (Array.isArray(v) && v.length) {
            const first = typeof v[0] === 'string' ? v[0] : v[0] && (v[0].url || v[0].src);
            if (first && /^https?:\/\//i.test(String(first))) return String(first).slice(0, 1000);
        }
    }
    return '';
}

function variantGroupsFromRow(row) {
    const groups = [];
    const color = pickString(row, ['color', 'Colour', 'selected_color', 'variant_color']);
    const size = pickString(row, ['size', 'selected_size', 'variant_size']);
    const colors = row.colors || row.color_options || row.available_colors;
    const sizes = row.sizes || row.size_options || row.available_sizes;
    if (Array.isArray(colors) && colors.length > 1) {
        groups.push({
            name: 'Color',
            options: colors.map((c) => String(typeof c === 'string' ? c : c.name || c.label || '').trim()).filter(Boolean).slice(0, 40),
            selected: color || null,
        });
    } else if (color) {
        groups.push({ name: 'Color', options: [color], selected: color });
    }
    if (Array.isArray(sizes) && sizes.length > 1) {
        groups.push({
            name: 'Size',
            options: sizes.map((s) => String(typeof s === 'string' ? s : s.name || s.label || '').trim()).filter(Boolean).slice(0, 40),
            selected: size || null,
        });
    } else if (size) {
        groups.push({ name: 'Size', options: [size], selected: size });
    }
    return groups.filter((g) => g.options.length);
}

/**
 * Map one Kohl's dataset record into buy-page product facts.
 * Field names vary by Bright Data schema version — try common aliases.
 */
function productFromKohlsRecord(row, url) {
    if (!row || typeof row !== 'object') return null;
    const title = pickString(row, ['title', 'name', 'product_name', 'product_title', 'Title']);
    if (!title) return null;
    const sale = pickCents(row, [
        'final_price',
        'sale_price',
        'current_price',
        'price',
        'finalPrice',
        'salePrice',
        'offers.price',
        'Price',
    ]);
    const list = pickCents(row, ['regular_price', 'list_price', 'original_price', 'was_price', 'compare_at']);
    let pagePriceCents = sale;
    if (list != null && sale != null && list < sale) pagePriceCents = list;
    const brand = pickString(row, ['brand', 'Brand', 'manufacturer']);
    const imageUrl = firstImage(row);
    const inStockRaw = row.in_stock ?? row.inStock ?? row.availability ?? row.is_available;
    let inStock = null;
    if (inStockRaw === true || /in.?stock|available/i.test(String(inStockRaw))) inStock = true;
    if (inStockRaw === false || /out.?of.?stock|unavailable/i.test(String(inStockRaw))) inStock = false;
    const shipCents = pickCents(row, ['shipping', 'shipping_price', 'shipping_cost', 'delivery_price']);
    return {
        title: title.slice(0, 300),
        brand: brand.slice(0, 120),
        imageUrl,
        category: pickString(row, ['category', 'product_category']).slice(0, 120),
        packageDimensions: null,
        pagePriceCents,
        standardShip: {
            cents: shipCents,
            arrivalDate: null,
            note: shipCents === 0 ? 'Free standard shipping.' : '',
        },
        pageNotes: [],
        inStock,
        isElectronics: false,
        variantGroups: variantGroupsFromRow(row),
        choicePrompt: pagePriceCents == null ? 'Choose a size and color on the product page, then add the link again.' : '',
        readBy: 'brightdata_kohls',
        sourceUrl: url,
        rawKeys: Object.keys(row).slice(0, 40),
    };
}

async function downloadSnapshot(snapshotId, doFetch, key) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SCRAPE_TIMEOUT_MS);
    try {
        const started = Date.now();
        while (Date.now() - started < SCRAPE_TIMEOUT_MS) {
            const resp = await doFetch(
                `https://api.brightdata.com/datasets/v3/snapshot/${encodeURIComponent(snapshotId)}?format=json`,
                { headers: { Authorization: `Bearer ${key}` }, signal: ctrl.signal },
            );
            if (resp.status === 200) {
                const text = await resp.text();
                try {
                    return JSON.parse(text);
                } catch {
                    return null;
                }
            }
            if (resp.status !== 202) {
                console.warn('[brightdata-kohls] snapshot', resp.status, snapshotId);
                return null;
            }
            await new Promise((r) => setTimeout(r, 3000));
        }
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Live Kohl's product via pre-built dataset scraper gd_mlji2hi729x1g0vg4i.
 * @returns {Promise<{ ok: true, product: object, record: object } | { ok: false, reason: string }>}
 */
async function scrapeKohlsProduct(url, deps) {
    const key = apiKey();
    if (!key) return { ok: false, reason: 'brightdata_not_configured' };
    const doFetch = (deps && deps.fetch) || fetch;
    const datasetId = String((deps && deps.datasetId) || KOHLS_DATASET_ID);
    const endpoint = `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${encodeURIComponent(datasetId)}&format=json&include_errors=true`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SCRAPE_TIMEOUT_MS);
    try {
        // Bright Data accepts a bare URL array (docs + MCP guidance) for this scraper.
        const resp = await doFetch(endpoint, {
            method: 'POST',
            signal: ctrl.signal,
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify([{ url: String(url) }]),
        });
        const text = await resp.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = null;
        }

        if (resp.status === 202 && data && data.snapshot_id) {
            data = await downloadSnapshot(data.snapshot_id, doFetch, key);
        } else if (!resp.ok) {
            console.warn('[brightdata-kohls]', `http_${resp.status}`, text.slice(0, 160).replace(/\s+/g, ' '));
            return { ok: false, reason: `brightdata_scrape_${resp.status}` };
        }

        const rows = Array.isArray(data) ? data : data && Array.isArray(data.data) ? data.data : data ? [data] : [];
        const row = rows.find((r) => r && typeof r === 'object' && !r.error) || rows[0];
        if (!row || row.error) {
            return { ok: false, reason: 'brightdata_kohls_empty' };
        }
        const product = productFromKohlsRecord(row, url);
        if (!product || !product.title) return { ok: false, reason: 'brightdata_kohls_no_title' };
        return { ok: true, product, record: row };
    } catch (e) {
        const aborted = e && (e.name === 'AbortError' || /abort/i.test(String(e.message || '')));
        return { ok: false, reason: aborted ? 'brightdata_scrape_timeout' : 'brightdata_scrape_failed' };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * @param {string} url
 * @param {{ fetch?: typeof fetch, render?: boolean }} [deps]
 */
async function fetchHtml(url, deps) {
    const key = apiKey();
    if (!key) return { ok: false, reason: 'brightdata_not_configured' };
    const zone = unlockerZone();
    if (!zone) return { ok: false, reason: 'brightdata_zone_missing' };

    const doFetch = (deps && deps.fetch) || fetch;
    const render = deps && deps.render === false ? 'false' : 'true';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const resp = await doFetch('https://api.brightdata.com/request', {
            method: 'POST',
            signal: ctrl.signal,
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                zone,
                url: String(url),
                format: 'raw',
                country: 'us',
                render,
            }),
        });
        const text = await resp.text();
        if (!resp.ok) {
            let code = '';
            try {
                code = (JSON.parse(text).error_code || JSON.parse(text).error || '').toString().slice(0, 40);
            } catch {
                code = text.slice(0, 80).replace(/\s+/g, ' ');
            }
            console.warn('[brightdata]', `http_${resp.status}`, code || '', String(url).slice(0, 100));
            return { ok: false, reason: `brightdata_http_${resp.status}` };
        }
        const html = Buffer.from(text).subarray(0, MAX_BYTES).toString('utf8');
        if (html.length < 500) return { ok: false, reason: 'brightdata_empty' };
        const statusHdr = resp.headers.get('x-brd-status-code');
        if (statusHdr && !/^2\d\d$/.test(String(statusHdr))) {
            console.warn('[brightdata]', 'target_status', statusHdr, String(url).slice(0, 100));
            return { ok: false, reason: `brightdata_target_${statusHdr}` };
        }
        return { ok: true, html, finalUrl: url, via: 'brightdata' };
    } catch (e) {
        const aborted = e && (e.name === 'AbortError' || /abort/i.test(String(e.message || '')));
        return { ok: false, reason: aborted ? 'brightdata_timeout' : 'brightdata_failed' };
    } finally {
        clearTimeout(timer);
    }
}

module.exports = {
    isConfigured,
    fetchHtml,
    scrapeKohlsProduct,
    productFromKohlsRecord,
    moneyToCents,
    TIMEOUT_MS,
    SCRAPE_TIMEOUT_MS,
    KOHLS_DATASET_ID,
    unlockerZone,
};
