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
    'priceUsd and standardShipping.priceUsd must be numbers printed on the page. Use null when they are not shown.',
    'standardShipping is the one regular shipping option anyone can buy without a membership.',
    'Use the option the page marks as standard or default. Otherwise use the cheapest regular option.',
    'Never use Prime, Prime-member, Walmart+, Target Circle, Beauty Insider, Totaltech, or any club or membership price.',
    'A priceUsd of 0 is allowed only when regular shipping is free for every shopper, not only for members.',
    'arrivalDate is the regular delivery date shown for that option, as YYYY-MM-DD. Use null only when no date is shown.',
    'variantGroups lists choices the buyer must make (size, color, style, capacity). Leave it empty when none.',
    'isElectronics is true for powered devices and gadgets. Printer paper, sticker paper, ink, and labels are not electronics.',
    'Return JSON: {"kind":"product"|"list"|"unknown","productUrl":string|null,"productId":string|null,',
    '"title":string,"brand":string,"imageUrl":string,"priceUsd":number|null,"inStock":bool|null,"category":string,',
    '"isElectronics":bool,"variantGroups":[{"name":string,"options":[string],"selected":string|null}],',
    '"packageDimensions":string,"standardShipping":{"label":string,"priceUsd":number|null,"arrivalDate":string|null}}',
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
    if (usd === 0) {
        const text = visibleText(html);
        if (/ships\s+free\b/i.test(text)) return true;
        if (/free\s+shipping\b/i.test(text) && !/free\s+shipping[^.]{0,48}(?:with|on orders|over)\s+\$/i.test(text)) return true;
        if (/free\s+delivery\b/i.test(text) && !/free\s+delivery[^.]{0,48}over\s+\$/i.test(text)) return true;
        return false;
    }
    return priceAppearsInPage(html, usd);
}

function taxOnPage(html, usd) {
    if (!Number.isFinite(usd) || usd < 0 || !/tax/i.test(html)) return false;
    if (usd === 0) return /(?:no tax|tax[^.\n]{0,40}\$ ?0(?:\.00)?)/i.test(html);
    return priceAppearsInPage(html, usd);
}

function membershipOnly(label) {
    return /prime|walmart\s*\+|target\s*circle|\bcircle\b|beauty\s*insider|total\s*tech|totaltech|nordy|\bmember(ship)?\b|rewards\s+member/i.test(label);
}

function shippingApplies(option, itemCents) {
    if (membershipOnly(option.label)) return false;
    const over = option.label.match(/over \$(\d+)/i);
    if (over && itemCents < Number(over[1]) * 100) return false;
    return true;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function ymdFromMonthDay(monName, day) {
    const mon = MONTHS[String(monName || '').toLowerCase().slice(0, 3)];
    const d = Number(day);
    if (!mon || d < 1 || d > 31) return null;
    const now = new Date();
    let year = now.getFullYear();
    if (mon < now.getMonth() + 1 || (mon === now.getMonth() + 1 && d < now.getDate() - 1)) year += 1;
    return `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Regular delivery printed on the page. Skips Prime and other membership sentences. No extra request. */
function standardFromPage(html, itemCents) {
    const text = visibleText(html).replace(/\s+/g, ' ');
    const arrives = text.match(/arrives\s+by\s+(?:[A-Za-z]+,\s+)?([A-Za-z]+)\s+(\d{1,2})/i);
    if (arrives) {
        const arrivalDate = ymdFromMonthDay(arrives[1], arrives[2]);
        if (arrivalDate) {
            const shipsFree = /ships\s+free\b/i.test(text);
            const over = text.match(/(?:free\s+shipping|ships\s+free)[^.]{0,48}(?:with|on|over)\s+\$(\d+)/i);
            if (shipsFree && !(over && itemCents < Number(over[1]) * 100)) {
                return { label: 'Standard shipping', cents: 0, arrivalDate, note: '' };
            }
            if (over && itemCents < Number(over[1]) * 100) {
                return { label: 'Standard shipping', cents: null, arrivalDate, note: `Free on orders over $${over[1]}` };
            }
            return { label: 'Standard shipping', cents: null, arrivalDate, note: '' };
        }
    }
    const re = /((?:free\s+)?delivery)\s+(?:on\s+)?(?:[A-Za-z]+,\s+)?([A-Za-z]+)\s+(\d{1,2})([^.]{0,100})/gi;
    let m;
    while ((m = re.exec(text))) {
        const window = m[0];
        if (membershipOnly(window)) continue;
        const arrivalDate = ymdFromMonthDay(m[2], m[3]);
        if (!arrivalDate) continue;
        const over = window.match(/over\s+\$(\d+)/i);
        const free = /free/i.test(window);
        if (free && over && itemCents < Number(over[1]) * 100) {
            return { label: 'Standard shipping', cents: null, arrivalDate, note: `Free on orders over $${over[1]}` };
        }
        if (free) return { label: 'Standard shipping', cents: 0, arrivalDate, note: '' };
        const dollars = window.match(/\$\s?(\d+(?:\.\d{2})?)/);
        if (dollars) return { label: 'Standard shipping', cents: Math.round(Number(dollars[1]) * 100), arrivalDate, note: '' };
        return { label: 'Standard shipping', cents: null, arrivalDate, note: '' };
    }
    return null;
}

/** The regular option: the one marked standard or default, otherwise the cheapest. Dated options win. */
function standardChoice(options) {
    if (!options.length) return null;
    const dated = options.filter((o) => o.arrivalDate);
    const pool = dated.length ? dated : options;
    const named = pool.filter((o) => /\b(standard|default)\b/i.test(o.label));
    const list = named.length ? named : pool;
    return list.slice().sort((a, b) => a.cents - b.cents)[0];
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

const TARGET_KEY = 'ff457966e64d5e877fdbad070f276d18ecec4a01';

function targetTcin(url) {
    const m = String(url || '').match(/\/A-(\d{5,12})(?:\b|\/|$)/i);
    return m ? m[1] : '';
}

/** Target prints the price in a product API, not in the first HTML. */
async function targetProduct(url) {
    const tcin = targetTcin(url);
    if (!tcin) return null;
    const api =
        'https://redsky.target.com/redsky_aggregations/v1/web/pdp_client_v1' +
        `?key=${TARGET_KEY}&tcin=${tcin}&is_bot=false&store_id=3991&pricing_store_id=3991` +
        `&has_pricing_store_id=true&channel=WEB&page=${encodeURIComponent(`/p/A-${tcin}`)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    let resp;
    try {
        resp = await fetch(api, {
            signal: ctrl.signal,
            headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://www.target.com/' },
        });
    } catch (_) {
        return null;
    } finally {
        clearTimeout(timer);
    }
    if (!resp.ok) return null;
    const body = await resp.json().catch(() => null);
    const product = body && body.data && body.data.product;
    if (!product || !product.item) return null;
    const item = product.item;
    const price = Number(product.price && product.price.current_retail);
    const pagePriceCents = Number.isFinite(price) && price > 0 ? Math.round(price * 100) : null;
    const title = String((item.product_description && item.product_description.title) || '').trim();
    const brand = String((item.primary_brand && item.primary_brand.name) || '').trim();
    const typeName = String((item.product_classification && item.product_classification.product_type_name) || '');
    const itemType = String((item.product_classification && item.product_classification.item_type && item.product_classification.item_type.name) || '');
    const image = (JSON.stringify(product).match(/https:\/\/target\.scene7\.com\/is\/image\/Target\/[A-Za-z0-9_-]+/) || [])[0] || '';
    const free = !!(product.free_shipping && product.free_shipping.enabled);
    return {
        title: decodeEntities(title).slice(0, 300),
        brand: decodeEntities(brand).slice(0, 120),
        imageUrl: image,
        pagePriceCents,
        category: (itemType || typeName).slice(0, 120),
        isElectronics: /\belectronics?\b/i.test(`${typeName} ${itemType}`),
        standardShip: free ? { label: 'Standard shipping', cents: 0, arrivalDate: null, note: '' } : null,
    };
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
    let facts = null;
    let meta = { title: '', image: '', price: '', availability: '' };
    if (grokClient.isConfigured()) {
        try {
            ({ facts, meta } = await askGrok({ retailerName: r.name, url, html: page.html }));
        } catch (e) {
            if (retailer !== 'target') return { ok: false, reason: `grok_failed: ${e && e.message ? e.message : e}`, needsPerson: true };
        }
    } else if (retailer !== 'target') {
        return { ok: false, reason: 'grok_not_configured', needsPerson: true };
    }
    if (facts && facts.kind === 'list') {
        return { ok: false, reason: 'product_list', needsPerson: false };
    }
    facts = facts && typeof facts === 'object' ? facts : {};
    let title = String(facts.title || meta.title || '').trim().slice(0, 300);
    const priceUsd = Number(facts.priceUsd);
    const priceSeen = priceAppearsInPage(page.html, priceUsd);
    let category = String(facts.category || '').trim().slice(0, 120);
    let pagePriceCents = priceSeen ? Math.round(priceUsd * 100) : null;
    const offered = facts.standardShipping
        ? [{ label: facts.standardShipping.label || 'Standard shipping', priceUsd: facts.standardShipping.priceUsd, arrivalDate: facts.standardShipping.arrivalDate }]
        : facts.shippingOptions;
    let applicable = cleanShipping(page.html, offered).filter((o) => shippingApplies(o, pagePriceCents || 0));
    let chosen = standardChoice(applicable) || standardFromPage(page.html, pagePriceCents || 0);
    let brand = String(facts.brand || '').trim().slice(0, 120);
    let imageUrl = safeImageUrl(facts.imageUrl) || safeImageUrl(meta.image) || imageFallback(page.html);
    let isElectronics = /\b(sticker|printer|photo|inkjet|label)\s+paper\b/i.test(`${category} ${title}`)
        ? false
        : facts.isElectronics === true || looksElectronic(retailer, category, title);
    if (retailer === 'target') {
        const tf = await targetProduct(url);
        if (tf) {
            if (tf.title) title = tf.title;
            if (tf.brand) brand = tf.brand;
            if (tf.category) category = tf.category;
            if (tf.imageUrl) imageUrl = tf.imageUrl;
            if (tf.pagePriceCents) pagePriceCents = tf.pagePriceCents;
            isElectronics = tf.isElectronics;
            const dated = standardFromPage(page.html, pagePriceCents || 0);
            if (tf.standardShip) {
                chosen = {
                    label: 'Standard shipping',
                    cents: tf.standardShip.cents,
                    arrivalDate: (dated && dated.arrivalDate) || null,
                    note: (dated && dated.note) || '',
                };
            } else if (dated) chosen = dated;
        }
    }
    if (!title) return { ok: false, reason: 'no_title', needsPerson: true };
    const pageOffer = pagePriceCents && chosen && chosen.cents != null ? { itemPriceCents: pagePriceCents, shippingOptions: [chosen] } : null;
    const amazonCategory = await categories.categorize({ retailer, retailerName: r.name, html: page.html, title, brand, category });
    return {
        ok: true,
        product: {
            title,
            brand,
            imageUrl,
            category,
            amazonCategory,
            packageDimensions: String(facts.packageDimensions || '').trim().slice(0, 120),
            pagePriceCents,
            pageOffer,
            standardShip: chosen ? { cents: chosen.cents, arrivalDate: chosen.arrivalDate || null, note: chosen.note || '' } : null,
            pageNotes: [],
            inStock: facts.inStock === false ? false : facts.inStock === true ? true : null,
            isElectronics,
            variantGroups: cleanVariantGroups(facts.variantGroups),
            readAt: new Date().toISOString(),
            readBy: 'grok',
        },
    };
}

module.exports = { readProduct, askGrok, looksElectronic, priceAppearsInPage, jsonLdProducts, visibleText, fetchPage, standardFromPage };
