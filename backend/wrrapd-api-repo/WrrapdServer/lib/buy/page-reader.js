/**
 * Reads a retailer product page and asks Grok for the item facts (title, photo, variants,
 * electronics). The product page price is only a preview; the bill uses the retailer cost page.
 * When the retailer blocks the read, the caller sends the link to the Command Center quote desk.
 */
const grokClient = require('../grok-client');
const retailers = require('./retailers');
const categories = require('./categories');

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const MAX_BYTES = 3 * 1024 * 1024;
const BLOCK_MARKERS = /captcha|robot check|are you a human|access denied|pardon our interruption|request blocked|px-captcha|unusual traffic/i;
const ELECTRONICS_WORDS =
    /\b(electronics?|computers?|laptops?|tablets?|ipad|iphone|smartphones?|cell phones?|headphones?|earbuds|airpods|speakers?|televisions?|tvs?|monitors?|cameras?|camcorders?|drones?|smart ?watch(?:es)?|wearables?|video game consoles?|gaming consoles?|playstation|xbox|nintendo switch|e-?readers?|kindle|routers?|printers?|projectors?|smart home)\b/i;

function hostAllowed(retailerId, host, extraHosts) {
    const h = String(host || '').toLowerCase().replace(/\.$/, '');
    const r = retailers.byId(retailerId);
    const allowed = new Set([...(r ? r.hosts : []), ...(extraHosts || [])]);
    return allowed.has(h);
}

async function fetchPage(retailerId, url, extraHosts) {
    let current = url;
    for (let hop = 0; hop < 5; hop++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);
        let resp;
        try {
            resp = await fetch(current, {
                redirect: 'manual',
                signal: ctrl.signal,
                headers: {
                    'User-Agent': UA,
                    Accept: 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            });
        } finally {
            clearTimeout(timer);
        }
        if (resp.status >= 300 && resp.status < 400) {
            const loc = resp.headers.get('location');
            if (!loc) return { ok: false, reason: 'redirect_without_location' };
            const next = new URL(loc, current);
            if (!hostAllowed(retailerId, next.hostname, extraHosts)) return { ok: false, reason: 'redirect_off_site' };
            current = next.toString();
            continue;
        }
        if (!resp.ok) return { ok: false, reason: `http_${resp.status}` };
        const buf = Buffer.from(await resp.arrayBuffer());
        const html = buf.subarray(0, MAX_BYTES).toString('utf8');
        if (html.length < 20000 && BLOCK_MARKERS.test(html)) return { ok: false, reason: 'blocked' };
        return { ok: true, html, finalUrl: current };
    }
    return { ok: false, reason: 'too_many_redirects' };
}

function decodeEntities(s) {
    return String(s || '')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function metaContent(html, key) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i');
    const m = html.match(re) || html.match(re2);
    return m ? decodeEntities(m[1]).trim() : '';
}

function jsonLdProducts(html) {
    const out = [];
    const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html)) && out.length < 6) {
        try {
            const data = JSON.parse(m[1].trim());
            const stack = Array.isArray(data) ? data.slice() : [data];
            while (stack.length) {
                const node = stack.shift();
                if (!node || typeof node !== 'object') continue;
                if (Array.isArray(node['@graph'])) stack.push(...node['@graph']);
                const t = node['@type'];
                if (t === 'Product' || (Array.isArray(t) && t.includes('Product')) || t === 'ProductGroup') out.push(node);
            }
        } catch (_) {
            /* malformed JSON-LD */
        }
    }
    return out;
}

function visibleText(html) {
    return decodeEntities(
        html
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
            .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
            .replace(/<[^>]+>/g, ' '),
    )
        .replace(/\s+/g, ' ')
        .trim();
}

function priceAppearsInPage(html, priceUsd) {
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return false;
    const fixed = priceUsd.toFixed(2);
    const [whole, cents] = fixed.split('.');
    const withComma = Number(whole).toLocaleString('en-US');
    return (
        html.includes(fixed) ||
        html.includes(`${withComma}.${cents}`) ||
        (cents === '00' && new RegExp(`\\$\\s?${withComma}(?![\\d.])`).test(html))
    );
}

function safeImageUrl(v) {
    try {
        const u = new URL(String(v || ''));
        return u.protocol === 'https:' ? u.toString().slice(0, 1000) : '';
    } catch (_) {
        return '';
    }
}

function imageFallback(html) {
    const pick = (re) => {
        const m = html.match(re);
        return m ? safeImageUrl(decodeEntities(m[1])) : '';
    };
    return (
        pick(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i) ||
        pick(/data-old-hires=["'](https:[^"']+)["']/i) ||
        pick(/"hiRes":"(https:[^"]+)"/) ||
        pick(/id=["']landingImage["'][^>]+src=["'](https:[^"']+)["']/i) ||
        pick(/<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i)
    );
}

function looksElectronic(retailerId, ...texts) {
    if (retailerId === 'bestbuy') return true;
    const blob = texts.join(' ');
    // Printer paper and sticker sheets mention "printer" and are not electronics.
    if (/\b(sticker|printer|photo|inkjet|label)\s+paper\b/i.test(blob)) return false;
    return ELECTRONICS_WORDS.test(blob);
}

const SYSTEM_PROMPT = [
    'You read a retailer page and return only facts that are in the material. Never guess.',
    'kind is "product" when the page is one item a shopper can buy.',
    'kind is "list" when it is a search, category, or promo of many items.',
    'kind is "unknown" when the material does not show which.',
    'productUrl and productId must appear in the material. Use null otherwise.',
    'priceUsd, each shipping priceUsd, and taxUsd must be numbers printed on the page. Use null when they are not shown.',
    'A shipping priceUsd of 0 is allowed only when the page says that shipping or delivery is free.',
    'arrivalDate is YYYY-MM-DD only when a delivery date is shown, otherwise null.',
    'variantGroups lists choices the buyer must make (size, color, style, capacity). Leave it empty when none.',
    'isElectronics is true for powered devices and gadgets. Printer paper, sticker paper, ink, and labels are not electronics.',
    'Return JSON: {"kind":"product"|"list"|"unknown","productUrl":string|null,"productId":string|null,',
    '"title":string,"brand":string,"imageUrl":string,"priceUsd":number|null,"inStock":bool|null,"category":string,',
    '"isElectronics":bool,"variantGroups":[{"name":string,"options":[string],"selected":string|null}],',
    '"packageDimensions":string,"shippingOptions":[{"label":string,"priceUsd":number|null,"arrivalDate":string|null}],"taxUsd":number|null}',
].join(' ');

function embeddedHints(html) {
    const bits = [];
    const next = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (next) {
        try {
            const data = JSON.parse(next[1]);
            bits.push(JSON.stringify({ page: data.page, query: data.query }).slice(0, 2500));
        } catch (_) {
            /* ignore */
        }
    }
    const ids = html.match(/"(?:tcin|sku|asin|productId)"\s*:\s*"?[A-Z0-9]{5,16}"?/gi);
    if (ids) bits.push([...new Set(ids)].slice(0, 12).join('\n'));
    const dollars = [];
    const re = /[^<\n]{0,48}\$\s?\d{1,4}(?:\.\d{2})?[^<\n]{0,48}/g;
    let m;
    const plain = visibleText(html);
    while ((m = re.exec(plain)) && dollars.length < 12) dollars.push(m[0].replace(/\s+/g, ' ').trim());
    if (dollars.length) bits.push(dollars.join('\n'));
    return bits.join('\n').slice(0, 8000);
}

function numberOnPage(html, usd) {
    if (usd === 0) return /free delivery/i.test(html) || /free shipping(?! option)/i.test(html);
    return priceAppearsInPage(html, usd);
}

function taxOnPage(html, usd) {
    if (!Number.isFinite(usd) || usd < 0 || !/tax/i.test(html)) return false;
    if (usd === 0) return /(?:no tax|tax[^.\n]{0,40}\$ ?0(?:\.00)?)/i.test(html);
    return priceAppearsInPage(html, usd);
}

function shippingApplies(option, itemCents) {
    if (/prime member/i.test(option.label)) return false;
    const over = option.label.match(/over \$(\d+)/i);
    if (over && itemCents < Number(over[1]) * 100) return false;
    return true;
}

function cleanShipping(html, options) {
    if (!Array.isArray(options)) return [];
    return options
        .slice(0, 4)
        .map((o) => {
            const priceUsd = Number(o && o.priceUsd);
            const cents = Number.isFinite(priceUsd) && priceUsd >= 0 ? Math.round(priceUsd * 100) : null;
            if (cents == null || !numberOnPage(html, priceUsd)) return null;
            const arrival = /^\d{4}-\d{2}-\d{2}$/.test(String((o && o.arrivalDate) || '')) ? o.arrivalDate : null;
            return {
                label: String((o && o.label) || '').trim().slice(0, 80) || (cents === 0 ? 'Free shipping' : 'Shipping'),
                cents,
                arrivalDate: arrival,
            };
        })
        .filter(Boolean);
}

async function askGrok({ retailerName, url, html }) {
    const ld = jsonLdProducts(html).slice(0, 3);
    const meta = {
        title: metaContent(html, 'og:title') || (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '',
        image: metaContent(html, 'og:image'),
        price: metaContent(html, 'product:price:amount') || metaContent(html, 'og:price:amount'),
        availability: metaContent(html, 'product:availability'),
    };
    const text = visibleText(html).slice(0, 12000);
    const user = JSON.stringify({
        retailer: retailerName,
        url,
        meta,
        jsonLd: ld,
        embedded: embeddedHints(html),
        pageText: text,
    }).slice(0, 60000);
    const { content } = await grokClient.chatCompletions({
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: user },
        ],
        temperature: 0,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
    });
    return { facts: grokClient.parseJsonContent(content), meta };
}

function cleanVariantGroups(groups) {
    if (!Array.isArray(groups)) return [];
    return groups
        .slice(0, 4)
        .map((g) => ({
            name: String((g && g.name) || '').trim().slice(0, 40),
            options: Array.isArray(g && g.options)
                ? [...new Set(g.options.map((o) => String(o).trim().slice(0, 80)).filter(Boolean))].slice(0, 40)
                : [],
            selected: g && g.selected ? String(g.selected).trim().slice(0, 80) : null,
        }))
        .filter((g) => g.name && g.options.length > 1);
}

/**
 * @returns {Promise<{ ok: true, product: object } | { ok: false, reason: string, needsPerson: boolean }>}
 */
async function readProduct({ retailer, url }) {
    const r = retailers.byId(retailer);
    if (!r) return { ok: false, reason: 'retailer_not_supported', needsPerson: false };
    let page;
    try {
        page = await fetchPage(retailer, url);
    } catch (e) {
        return { ok: false, reason: `fetch_failed: ${e && e.message ? e.message : e}`, needsPerson: true };
    }
    if (!page.ok) return { ok: false, reason: page.reason, needsPerson: true };
    if (!grokClient.isConfigured()) return { ok: false, reason: 'grok_not_configured', needsPerson: true };
    let facts;
    let meta;
    try {
        ({ facts, meta } = await askGrok({ retailerName: r.name, url, html: page.html }));
    } catch (e) {
        return { ok: false, reason: `grok_failed: ${e && e.message ? e.message : e}`, needsPerson: true };
    }
    if (!facts || facts.kind === 'list') {
        return { ok: false, reason: 'product_list', needsPerson: false };
    }
    const title = String(facts.title || meta.title || '').trim().slice(0, 300);
    if (!title) return { ok: false, reason: 'no_title', needsPerson: true };
    const priceUsd = Number(facts.priceUsd);
    const priceSeen = priceAppearsInPage(page.html, priceUsd);
    const category = String(facts.category || '').trim().slice(0, 120);
    const pagePriceCents = priceSeen ? Math.round(priceUsd * 100) : null;
    const shippingOptions = cleanShipping(page.html, facts.shippingOptions);
    const applicable = shippingOptions.filter((o) => shippingApplies(o, pagePriceCents || 0));
    const taxUsd = Number(facts.taxUsd);
    const taxCents = Number.isFinite(taxUsd) && taxUsd >= 0 && taxOnPage(page.html, taxUsd) ? Math.round(taxUsd * 100) : null;
    const pageOffer = pagePriceCents && applicable.length && taxCents != null ? { itemPriceCents: pagePriceCents, shippingOptions: applicable, taxCents } : null;
    const brand = String(facts.brand || '').trim().slice(0, 120);
    const amazonCategory = await categories.categorize({ retailer, retailerName: r.name, html: page.html, title, brand, category });
    return {
        ok: true,
        product: {
            title,
            brand,
            imageUrl: safeImageUrl(facts.imageUrl) || safeImageUrl(meta.image) || imageFallback(page.html),
            category,
            amazonCategory,
            packageDimensions: String(facts.packageDimensions || '').trim().slice(0, 120),
            pagePriceCents,
            pageOffer,
            pageNotes: shippingOptions.map((o) => o.label).slice(0, 2),
            inStock: facts.inStock === false ? false : facts.inStock === true ? true : null,
            isElectronics: /\b(sticker|printer|photo|inkjet|label)\s+paper\b/i.test(`${category} ${title}`)
                ? false
                : facts.isElectronics === true || looksElectronic(retailer, category, title),
            variantGroups: cleanVariantGroups(facts.variantGroups),
            readAt: new Date().toISOString(),
            readBy: 'grok',
        },
    };
}

module.exports = { readProduct, askGrok, looksElectronic, priceAppearsInPage, jsonLdProducts, visibleText, fetchPage };
