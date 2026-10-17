/**
 * Reads a retailer product page and asks Grok for the item facts (title, photo, variants,
 * electronics). The product page price is only a preview; the bill uses the retailer cost page.
 * When the retailer blocks the read, the caller sends the link to the Command Center quote desk.
 */
const fs = require('fs');
const path = require('path');
const grokClient = require('../grok-client');
const retailers = require('./retailers');
const categories = require('./categories');
const zenrows = require('./zenrows');

const EXTERNAL_PAGES_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'external', 'pages');

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

const DIRECT_MS = 10000;

function usablePage(page) {
    if (!page || !page.ok || !page.html || page.html.length < 500) return false;
    if (page.html.length < 20000 && BLOCK_MARKERS.test(page.html)) return false;
    if (/select your country|best buy international/i.test(page.html)) return false;
    return true;
}

async function fetchDirect(retailerId, url, extraHosts) {
    const started = Date.now();
    let current = url;
    for (let hop = 0; hop < 5; hop++) {
        const left = DIRECT_MS - (Date.now() - started);
        if (left < 500) return { ok: false, reason: 'timeout' };
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), left);
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
        } catch (_) {
            return { ok: false, reason: 'timeout' };
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

async function fetchViaZenrows(retailerId, url, extraHosts) {
    const cookie = retailerId === 'bestbuy' ? 'intl_splash=false' : '';
    const page = await zenrows.fetchHtml(url, cookie ? { cookie } : undefined);
    if (!page.ok) return page;
    try {
        const host = new URL(page.finalUrl).hostname;
        if (!hostAllowed(retailerId, host, extraHosts)) return { ok: false, reason: 'redirect_off_site' };
    } catch (_) {
        return { ok: false, reason: 'zenrows_failed' };
    }
    return page;
}

function pageIsUsable(retailerId, page) {
    if (!usablePage(page)) return false;
    if (retailerId === 'nordstrom' && nordstromShell(page.html)) return false;
    return true;
}

/** These stores answer a plain request with a bot page or a page that never shows the delivery date. */
const ZENROWS_RETAILERS = new Set(['nordstrom', 'kohls', 'bestbuy']);

async function fetchPage(retailerId, url, extraHosts) {
    let rendered = null;
    if (ZENROWS_RETAILERS.has(retailerId)) {
        rendered = await fetchViaZenrows(retailerId, url, extraHosts);
        if (pageIsUsable(retailerId, rendered)) return rendered;
    }
    const direct = await fetchDirect(retailerId, url, extraHosts);
    if (pageIsUsable(retailerId, direct)) return direct;
    if (!rendered) rendered = await fetchViaZenrows(retailerId, url, extraHosts);
    if (pageIsUsable(retailerId, rendered)) return rendered;
    // Prefer the ZenRows failure reason for stores that require it — a bare
    // direct http_403 hides that the premium fetch also failed and looks like
    // the shopper's link is broken.
    if (ZENROWS_RETAILERS.has(retailerId) && rendered && !rendered.ok) {
        console.warn(
            '[buy-read]',
            retailerId,
            'zenrows',
            rendered.reason || 'failed',
            'direct',
            (direct && direct.reason) || 'n/a',
            String(url).slice(0, 120),
        );
        return rendered;
    }
    return rendered && rendered.ok ? rendered : direct;
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
    'A product page may also show related items. kind is still "product" when the URL is one item. Read that item, not a related one.',
    'When the URL has a sku parameter, that sku is the selected size, shade, or color.',
    'kind is "unknown" when the material does not show which.',
    'productUrl and productId must appear in the material. Use null otherwise.',
    'priceUsd and standardShipping.priceUsd must be numbers printed on the page. Use null when they are not shown.',
    'standardShipping is the one regular shipping option anyone can buy without a membership.',
    'Use the option the page marks as standard or default. Otherwise use the cheapest regular option.',
    'Never use Prime, Prime-member, Walmart+, Target Circle, Beauty Insider, Totaltech, or any club or membership price.',
    'A priceUsd of 0 is allowed only when regular shipping is free for every shopper, not only for members.',
    'arrivalDate is the regular delivery date shown for that option, as YYYY-MM-DD. Use null only when no date is shown.',
    'shipToZip is the 5-digit ZIP the page is shipping to, such as the ZIP next to Shipping to or Get It Shipped. Use null when no ZIP is shown.',
    'variantGroups lists choices the buyer must make (size, color, style, capacity). Leave it empty when none.',
    'isElectronics is true for powered devices and gadgets. Printer paper, sticker paper, ink, and labels are not electronics.',
    'Return JSON: {"kind":"product"|"list"|"unknown","productUrl":string|null,"productId":string|null,',
    '"title":string,"brand":string,"imageUrl":string,"priceUsd":number|null,"inStock":bool|null,"category":string,',
    '"isElectronics":bool,"variantGroups":[{"name":string,"options":[string],"selected":string|null}],',
    '"packageDimensions":string,"standardShipping":{"label":string,"priceUsd":number|null,"arrivalDate":string|null},"shipToZip":string|null}',
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

function ymdOffset(days) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('-').map(Number);
    const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
    return dt.toISOString().slice(0, 10);
}

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
    const between = text.match(/arrives\s+between\s+(?:[A-Za-z]+,\s+)?([A-Za-z]+)\s+(\d{1,2})\s+and\s+(?:[A-Za-z]+,\s+)?([A-Za-z]+)\s+(\d{1,2})/i);
    const dashed = text.match(/arrives\s+(?:by\s+)?(?:[A-Za-z]+,\s+)?([A-Za-z]+)\s+(\d{1,2})\s*[-–]\s*(?:[A-Za-z]+,\s+)?([A-Za-z]+)\s+(\d{1,2})/i);
    const windowed = between || dashed;
    if (windowed) {
        const start = ymdFromMonthDay(windowed[1], windowed[2]);
        const end = ymdFromMonthDay(windowed[3], windowed[4]);
        const arrivalDate = end && (!start || end > start) ? end : start;
        if (arrivalDate) return { label: 'Standard shipping', cents: null, arrivalDate, note: '' };
    }
    const arrives = text.match(/(?:arrives|get it|deliver(?:y|ed)?)\s+(?:by\s+)?(?:[A-Za-z]+,\s+)?([A-Za-z]+)\s+(\d{1,2})/i);
    if (arrives) {
        const arrivalDate = ymdFromMonthDay(arrives[1], arrives[2]);
        if (arrivalDate) {
            const shipsFree = /\b(?:ships\s+free|free\s*;?\s*arrives)\b/i.test(text);
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
    const tomorrow = text.match(/\barrives\s+(?:by\s+)?tomorrow\b/i);
    if (tomorrow) {
        const arrivalDate = ymdOffset(1);
        const window = text.slice(Math.max(0, tomorrow.index - 24), tomorrow.index + 48);
        if (!membershipOnly(window)) {
            if (/\bfree\b/i.test(window)) return { label: 'Standard shipping', cents: 0, arrivalDate, note: '' };
            const dollars = window.match(/\$\s?(\d+(?:\.\d{2})?)/);
            if (dollars) return { label: 'Standard shipping', cents: Math.round(Number(dollars[1]) * 100), arrivalDate, note: '' };
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

/** Shipping block Walmart prints on the product page. A different ship-to ZIP is not the giftee's date. */
function walmartShip(html, gifteeZip) {
    const text = String(html || '');
    const start = text.indexOf('"__typename":"ShippingOptionV2"');
    if (start < 0) return null;
    const block = text.slice(start, start + 1800);
    const date = (block.match(/"storeDeliveryDate":"(\d{4}-\d{2}-\d{2})/) || block.match(/"deliveryDate":"(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
    const free = /"freeFulfillment":true/.test(block);
    let cents = null;
    if (free) cents = 0;
    else {
        const price = block.match(/"fulfillmentPrice":(\{[^}]*\}|null|-?\d+(?:\.\d+)?)/);
        if (price && price[1] !== 'null') {
            if (price[1].startsWith('{')) {
                try {
                    const obj = JSON.parse(price[1]);
                    const n = Number(obj.price ?? obj.priceValue ?? obj.amount);
                    if (Number.isFinite(n) && n >= 0) cents = Math.round(n * 100);
                    else {
                        const s = String(obj.priceString || '').match(/\$\s?(\d+(?:\.\d{2})?)/);
                        if (s) cents = Math.round(Number(s[1]) * 100);
                    }
                } catch (_) { /* price object was cut off */ }
            } else {
                const n = Number(price[1]);
                if (Number.isFinite(n) && n >= 0) cents = Math.round(n * 100);
            }
        }
    }
    const postal = (text.match(/"shippingText":"Shipping"[\s\S]{0,400}?"postalCode":"(\d{5})"/) || block.match(/"locationText":"[^"]*?(\d{5})"/) || [])[1] || '';
    const strength = (text.match(/"intentStrength":"(IMPLICIT|EXPLICIT)"/) || [])[1] || '';
    const giftee = String(gifteeZip || '').replace(/\D/g, '');
    if (postal && giftee && postal !== giftee) {
        // IMPLICIT is Walmart's guess from the server's location, not the shopper's page.
        if (strength !== 'EXPLICIT') return { skip: true };
        return {
            label: 'Standard shipping',
            cents: null,
            arrivalDate: null,
            note: '',
            choicePrompt: `This page ships to ${postal}. Set the page to ${giftee}, then add the link again.`,
        };
    }
    if (!date && cents == null) return null;
    return { label: 'Standard shipping', cents, arrivalDate: date, note: cents === 0 ? 'Free standard shipping.' : '', choicePrompt: '' };
}

/** ZIP printed next to the page's ship-to control. Empty when the page does not show one. */
const BESTBUY_EXPRESS = /next day|two day|express|same day|rush|expedited/i;

/** Standard ship price and date from Best Buy's Shipping panel, only for this ZIP. */
function bestbuyShip(html, zip) {
    const want = String(zip || '').replace(/\D/g, '').slice(0, 5);
    if (want.length !== 5) return null;
    const text = String(html || '');
    const blockRe = /"destinationZipCode":"(\d{5})"[\s\S]{0,2200}?"customerLOSGroup":\[([\s\S]*?)\]/g;
    let block;
    let groups = '';
    while ((block = blockRe.exec(text))) {
        if (block[1] === want) groups = block[2];
    }
    if (!groups) return null;
    const items = [];
    const itemRe = /"maxLineItemMaxDate":"(\d{4}-\d{2}-\d{2})"[\s\S]{0,80}?"name":"([^"]+)"[\s\S]{0,40}?"price":([0-9.]+|null)/g;
    let item;
    while ((item = itemRe.exec(groups))) {
        items.push({
            arrivalDate: item[1],
            name: item[2],
            price: item[3] === 'null' ? null : Number(item[3]),
        });
    }
    if (!items.length) return null;
    const picked = items.find((row) => /standard|ground/i.test(row.name))
        || items.find((row) => !BESTBUY_EXPRESS.test(row.name))
        || items.slice().sort((a, b) => (a.price == null ? 999 : a.price) - (b.price == null ? 999 : b.price))[0];
    return {
        label: 'Standard shipping',
        cents: picked.price == null ? null : Math.round(picked.price * 100),
        arrivalDate: picked.arrivalDate,
        note: '',
    };
}

function pageShipZip(html) {
    const text = visibleText(html).replace(/\s+/g, ' ');
    const patterns = [
        /(?:shipping|shipped|deliver(?:y|ed)?)\s+to\s+(\d{5})\b/i,
        /\bget it shipped\b[^.]{0,80}?(\d{5})\b/i,
        /\bships?\s+to\s+(\d{5})\b/i,
    ];
    for (const re of patterns) {
        const found = text.match(re);
        if (found) return found[1];
    }
    return '';
}

function zipMismatchPrompt(expected, seen) {
    const want = String(expected || '').replace(/\D/g, '').slice(0, 5);
    if (want.length !== 5) return '';
    const got = String(seen || '').replace(/\D/g, '').slice(0, 5);
    if (got === want) return '';
    if (got.length !== 5) return '';
    return `This page ships to ${got}. Set the page to ${want}, then add the link again.`;
}

function kohlsPlain(html) {
    return String(html || '').replace(/&quot;/g, '"').replace(/\\"/g, '"');
}

/** Color names printed in the Kohl's product data. */
function kohlsColorNames(html) {
    const names = [];
    const re = /"color"\s*:\s*\[\s*\d+\s*,\s*"([^"]+)"\s*\]/g;
    let m;
    const text = kohlsPlain(html);
    while ((m = re.exec(text))) {
        const name = m[1].trim();
        if (!/^[A-Za-z][A-Za-z0-9 /'.-]{0,30}$/.test(name)) continue;
        if (!names.includes(name)) names.push(name);
    }
    return names;
}

/** Color of the Kohl's sku in the link, when that sku names one color. */
function kohlsSkuColor(html, url) {
    const sku = (String(url || '').match(/[?&]skuId=(\d+)/i) || [])[1] || '';
    if (!sku) return '';
    const text = kohlsPlain(html);
    const at = text.indexOf(sku);
    if (at < 0) return '';
    const block = text.slice(at, at + 5000);
    const named = block.match(/"color":\[\d+,"([^"]+)"\]/);
    if (named && named[1] && !/^null$/i.test(named[1])) return named[1];
    const image = block.match(/\/\d+_([A-Za-z][A-Za-z ]{1,40})/);
    return image ? image[1].trim() : '';
}

/**
 * Kohl's color clicks often keep the same link. When the page lists more than
 * one color, leave the choice open so the shopper picks it in the cart.
 */
function applyKohlsColors(groups, html, url) {
    const fromPage = kohlsColorNames(html);
    const next = (groups || []).map((g) => ({ ...g, options: (g.options || []).slice(), selected: g.selected || null }));
    let group = next.find((g) => /color/i.test(g.name));
    const options = group ? group.options.slice() : [];
    for (const color of fromPage) {
        if (!options.includes(color)) options.push(color);
    }
    if (options.length < 2) return withSelectedColor(next, options[0] || kohlsSkuColor(html, url));
    if (!group) next.unshift({ name: 'Color', options, selected: null });
    else {
        group.options = options;
        group.selected = null;
    }
    return next;
}

function withSelectedColor(groups, color) {
    if (!color) return groups;
    const next = (groups || []).map((g) => ({ ...g, options: (g.options || []).slice() }));
    let group = next.find((g) => /color/i.test(g.name));
    if (!group) {
        next.unshift({ name: 'Color', options: [color], selected: color });
        return next;
    }
    if (!group.options.includes(color)) group.options.unshift(color);
    group.selected = color;
    return next;
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

const standardShipping = require('./standard-shipping');

function withDefaultShip(retailer, chosen, merchandiseCents) {
    return standardShipping.fillMissing(retailer, chosen, merchandiseCents);
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

const TARGET_PAGE_KEY = '9f36aeafbe60771e321a7cc95a78140772ab3e96';

function quillTexts(node, out = []) {
    if (!node || typeof node !== 'object') return out;
    if (node.insert && typeof node.insert.text === 'string') out.push(node.insert.text);
    for (const kid of Array.isArray(node) ? node : Object.values(node)) quillTexts(kid, out);
    return out;
}

function fulfillmentSections(node, out = []) {
    if (!node || typeof node !== 'object') return out;
    if (typeof node.fulfillment_type === 'string') out.push(node);
    for (const kid of Array.isArray(node) ? node : Object.values(node)) fulfillmentSections(kid, out);
    return out;
}

/** Date and cost printed on Target's Shipping control, not pickup or same-day delivery. */
function shipFromFulfillment(json) {
    const sections = fulfillmentSections(json).filter((s) => s.fulfillment_type === 'SHIPPING' || s.fulfillment_type === 'SINGLE');
    const section = sections.find((s) => s.fulfillment_type === 'SHIPPING') || sections[0];
    if (!section) return null;
    const text = quillTexts(section).join(' ').replace(/\s+/g, ' ');
    const arrives = text.match(/arrives\s+by\s+(?:[A-Za-z]+,\s+)?([A-Za-z]+)\s+(\d{1,2})/i);
    const arrivalDate = arrives ? ymdFromMonthDay(arrives[1], arrives[2]) : null;
    let cents = null;
    if (/ships\s+free\b/i.test(text)) cents = 0;
    else {
        const dollars = text.match(/\$\s?(\d+(?:\.\d{2})?)/);
        if (dollars) cents = Math.round(Number(dollars[1]) * 100);
    }
    if (!arrivalDate && cents == null) return null;
    return { label: 'Standard shipping', cents, arrivalDate, note: '' };
}

/** Asks Target for the Shipping button copy (arrival date and ships-free / price). */
async function targetFulfillment(html, { zip, state, referer } = {}) {
    const pageContext = (String(html || '').match(/"page_context":"([^"]+)"/) || [])[1];
    const start = String(html || '').indexOf('"module_type":"ProductDetailFulfillment"');
    if (!pageContext || start < 0) return null;
    const slice = html.slice(start, start + 12000);
    const id = (slice.match(/"module_placement_id":"([^"]+)"/) || [])[1];
    const enrichment = (slice.match(/"enrichment_context":"([^"]+)"/) || [])[1];
    const tcin = (html.match(/"tcin":"(\d{5,12})"/) || [])[1];
    if (!id || !enrichment || !tcin) return null;
    const qs = new URLSearchParams({
        tcin,
        channel: 'WEB',
        page: `/p/A-${tcin}`,
        device_type: 'DESKTOP',
        sapphire_channel: 'WEB',
        sapphire_page: `/p/A-${tcin}`,
        timezone: 'America/New_York',
        country: 'US',
        key: TARGET_PAGE_KEY,
    });
    if (zip) qs.set('zip', String(zip));
    if (state) qs.set('state', String(state));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    let resp;
    try {
        resp = await fetch(`https://www.target.com/cdui_orchestrations/v1/pages/pdp/deferred_enrichment/modules?${qs}`, {
            method: 'POST',
            signal: ctrl.signal,
            headers: {
                'User-Agent': UA,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Origin: 'https://www.target.com',
                Referer: referer || 'https://www.target.com/',
            },
            body: JSON.stringify({
                page_context: pageContext,
                modules: [{ module_placement_id: id, module_type: 'ProductDetailFulfillment', enrichment_context: enrichment }],
            }),
        });
    } catch (_) {
        return null;
    } finally {
        clearTimeout(timer);
    }
    if (!resp.ok) return null;
    const body = await resp.json().catch(() => null);
    return body ? shipFromFulfillment(body) : null;
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

function looksLikePackage(value) {
    return /^\s*\d+(\.\d+)?\s*"?\s*x\s*\d+/i.test(String(value || ''));
}

function cleanVariantGroups(groups) {
    if (!Array.isArray(groups)) return [];
    return groups
        .slice(0, 4)
        .map((g) => ({
            name: String((g && g.name) || '').trim().slice(0, 40),
            options: Array.isArray(g && g.options)
                ? [...new Set(g.options.map((o) => String(o).trim().slice(0, 80)).filter((o) => o && !looksLikePackage(o)))].slice(0, 40)
                : [],
            selected: g && g.selected && !looksLikePackage(g.selected) ? String(g.selected).trim().slice(0, 80) : null,
        }))
        .filter((g) => g.name && g.options.length > 1);
}

/**
 * @returns {Promise<{ ok: true, product: object } | { ok: false, reason: string, needsPerson: boolean }>}
 */
/** Nordstrom's edge returns a large interstitial that is not the product page. */
function nordstromShell(html) {
    const text = String(html || '');
    if (!/istlWasHere/.test(text)) return false;
    return !/__INITIAL_CONFIG__/.test(text) && !/property=["']og:title["']/i.test(text);
}

function nordstromStyleId(url) {
    const m = String(url || '').match(/\/s\/(?:[^/]+\/)?(\d{5,10})(?:[/?#]|$)/);
    return m ? m[1] : '';
}

function nordstromParam(url, name) {
    try { return new URL(url).searchParams.get(name) || ''; } catch { return ''; }
}

function nordstromSame(a, b) {
    const norm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const left = norm(a);
    return !!left && left === norm(b);
}

function nordstromItemSize(item) {
    return item?.concatenatedDisplaySize || item?.sizeDimension1?.label || '';
}

function sliceJsonObject(text, start) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') { inStr = true; continue; }
        if (c === '{') depth += 1;
        else if (c === '}') {
            depth -= 1;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }
    return '';
}

function nordstromConfig(html) {
    const text = String(html || '');
    const marker = text.indexOf('window.__INITIAL_CONFIG__');
    if (marker < 0) return null;
    const brace = text.indexOf('{', text.indexOf('=', marker));
    if (brace < 0) return null;
    try { return JSON.parse(sliceJsonObject(text, brace)); } catch { return null; }
}

function nordstromChoices(entity) {
    const out = [];
    for (const product of entity?.coreProducts || []) {
        for (const choice of product?.coreChoices || []) out.push(choice);
    }
    return out;
}

function moneyCents(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number' || typeof value === 'string') {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
    }
    if (typeof value !== 'object') return null;
    if (value.units != null || value.nanos != null) {
        const cents = Math.round((Number(value.units) || 0) * 100 + (Number(value.nanos) || 0) / 1e7);
        return cents > 0 ? cents : null;
    }
    if (value.price != null) return moneyCents(value.price);
    if (value.minPrice != null) return moneyCents(value.minPrice);
    if (value.min != null) return moneyCents(value.min);
    return null;
}

function firstCents(bag, keys) {
    if (!bag || typeof bag !== 'object') return null;
    for (const key of keys) {
        if (bag[key] == null) continue;
        const cents = moneyCents(bag[key]);
        if (cents != null) return cents;
    }
    return null;
}

const NORDSTROM_SALE_KEYS = ['current', 'currentPrice', 'sale', 'salePrice', 'clearance', 'promotion', 'promotional', 'markdown'];
const NORDSTROM_REGULAR_KEYS = ['sellingRetail', 'regular', 'compareAt', 'original', 'base', 'list'];

/** Current price wins over the crossed-out regular price. */
function nordstromPriceCents(proposition, item) {
    const pricing = (proposition && proposition.pricings && proposition.pricings[0]) || {};
    const bags = [pricing, proposition, item && item.price, item];
    let sale = null;
    let regular = null;
    for (const bag of bags) {
        if (sale == null) sale = firstCents(bag, NORDSTROM_SALE_KEYS);
        if (regular == null) regular = firstCents(bag, NORDSTROM_REGULAR_KEYS);
    }
    return sale != null ? sale : regular;
}

function nordstromOffer(item) {
    for (const proposition of item?.sku?.propositions || []) {
        const soldOut = proposition?.salability?.status === 'SOLD_OUT' || proposition?.availability?.isAvailable === false;
        const cents = nordstromPriceCents(proposition, item);
        if (!soldOut && Number.isFinite(cents)) return { cents, skuId: item.sku.skuId, sellable: true };
    }
    return { cents: null, skuId: item?.sku?.skuId || '', sellable: false };
}

/** When the chosen price is the struck-through one, use the lower price printed next to it. */
function struckSaleCents(html, chosenCents) {
    const want = Number(chosenCents);
    if (!Number.isFinite(want) || want <= 0) return chosenCents;
    const text = String(html || '');
    const found = [];
    const grab = (chunk) => {
        const amounts = [...String(chunk).matchAll(/\$?\s*([0-9]+\.[0-9]{2})/g)].map((m) => Math.round(Number(m[1]) * 100));
        if (!amounts.length || amounts[0] !== want) return;
        const lower = amounts.filter((cents) => cents > 0 && cents < want);
        if (lower.length) found.push(Math.min(...lower));
    };
    const patterns = [
        /<(?:s|del|strike)\b[^>]*>[\s\S]{0,160}?<\/(?:s|del|strike)>[\s\S]{0,180}?\$?\s*[0-9]+\.[0-9]{2}/gi,
        /line-through[^>]*>[\s\S]{0,160}?<\/[^>]+>[\s\S]{0,180}?\$?\s*[0-9]+\.[0-9]{2}/gi,
    ];
    for (const re of patterns) {
        let m;
        while ((m = re.exec(text)) && found.length < 6) grab(m[0]);
    }
    return found.length ? Math.min(...found) : chosenCents;
}

function nordstromChoiceImage(choice) {
    const shots = choice?.orderedShots || [];
    const front = shots.find((shot) => /^front:onFigure/i.test(shot.shotName || '')) || shots[0];
    return safeImageUrl(front?.imageUrl || front?.thumbnailUrl || '');
}

const NORDSTROM_SIZE_RANK = ['xx-small', 'xxs', 'x-small', 'xs', 'small', 's', 'medium', 'm', 'large', 'l', 'x-large', 'xl', 'xx-large', 'xxl', '2x', '3x', '4x'];

function nordstromTitleCase(value) {
    return String(value || '').toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function nordstromStandardShip(config, zip, styleId, skuIds) {
    const rows = config?.storeMode?.promises?.entities?.[`${zip}-${styleId}`]?.promises || [];
    const wanted = new Set(skuIds.filter(Boolean));
    const costs = [];
    const dates = [];
    for (const row of rows) {
        if (wanted.size && !wanted.has(row.sku)) continue;
        const standard = (row.promises || []).find((promise) => promise.shipType === 'STANDARD_SHIPPING');
        if (standard?.customerCost == null) continue;
        const cents = Math.round(Number(standard.customerCost) * 100);
        if (!Number.isFinite(cents)) continue;
        costs.push(cents);
        if (standard.minDate) {
            const day = String(standard.minDate).slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(day)) dates.push(day);
        }
    }
    if (!costs.length) return null;
    const unique = [...new Set(costs)];
    const uniqueDates = [...new Set(dates)];
    return {
        cents: unique.length === 1 ? unique[0] : Math.min(...unique),
        arrivalDate: uniqueDates.length === 1 ? uniqueDates[0] : null,
    };
}

/**
 * Reads a real Nordstrom product page (the HTML a browser saves as Page Source).
 * The selected color's current price is used. A crossed-out regular price is not.
 */
function nordstromFromHtml(html, url, zip) {
    if (nordstromShell(html)) return null;
    const config = nordstromConfig(html);
    const styleId = nordstromStyleId(url);
    const entities = config?.productDisplay?.productDisplaysById?.entities || {};
    const entity = entities[styleId] || (Object.keys(entities).length === 1 ? entities[Object.keys(entities)[0]] : null);
    const id = entities[styleId] ? styleId : Object.keys(entities)[0];
    if (!entity || !id) return null;

    const choices = nordstromChoices(entity).filter((choice) => choice.displayColorDescription || choice.coreChoiceId);
    const colorQuery = nordstromParam(url, 'color');
    const sizeQuery = nordstromParam(url, 'size');
    const selectedChoice = choices.find((choice) => (
        choice.coreChoiceId === colorQuery
        || nordstromSame(choice.displayColorDescription, colorQuery)
        || nordstromSame(choice.colorFamily, colorQuery)
    )) || null;
    const sourceChoices = selectedChoice ? [selectedChoice] : choices;
    const looked = [];
    const offers = [];
    for (const choice of sourceChoices) {
        for (const item of choice.items || []) {
            if (sizeQuery && !nordstromSame(nordstromItemSize(item), sizeQuery)) continue;
            looked.push(item);
            const offer = nordstromOffer(item);
            if (offer.sellable) offers.push({ ...offer, item, choice });
        }
    }
    const prices = [...new Set(offers.map((offer) => offer.cents).filter((cents) => cents > 0))];
    let pagePriceCents = prices.length === 1 ? prices[0] : null;
    pagePriceCents = struckSaleCents(html, pagePriceCents);
    const colorNames = choices.map((choice) => nordstromTitleCase(choice.displayColorDescription)).filter(Boolean);
    const selectedColor = selectedChoice ? nordstromTitleCase(selectedChoice.displayColorDescription) : null;
    const variantSource = selectedChoice ? (selectedChoice.items || []) : choices.flatMap((choice) => choice.items || []);
    const sizeTypes = [...new Set(variantSource.map((item) => item?.sizeType?.label).filter(Boolean))];
    const sizes = [...new Set(variantSource.map((item) => item?.concatenatedDisplaySize || item?.sizeDimension1?.label).filter(Boolean))];
    sizes.sort((a, b) => {
        const left = NORDSTROM_SIZE_RANK.indexOf(String(a).toLowerCase());
        const right = NORDSTROM_SIZE_RANK.indexOf(String(b).toLowerCase());
        return (left < 0 ? 99 : left) - (right < 0 ? 99 : right);
    });
    const groups = [];
    const selectedSize = sizes.find((size) => nordstromSame(size, sizeQuery)) || null;
    if (colorNames.length) groups.push({ name: 'Color', options: colorNames, selected: selectedColor });
    if (sizeTypes.length) groups.push({ name: 'Size type', options: sizeTypes, selected: null });
    if (sizes.length) groups.push({ name: 'Size', options: sizes, selected: selectedSize });

    const skuIds = offers.map((offer) => offer.skuId);
    let standardShip = nordstromStandardShip(config, zip, id, skuIds);
    const domShip = standardFromPage(html, pagePriceCents || 0);
    const freeCopy = /Free shipping\.\s*Free returns/i.test(String(html || ''));
    if (!standardShip && domShip) {
        standardShip = { cents: domShip.cents, arrivalDate: domShip.arrivalDate || null };
    } else if (!standardShip && freeCopy) {
        standardShip = { cents: 0, arrivalDate: null };
    }
    if (standardShip && !standardShip.arrivalDate && domShip && domShip.arrivalDate) {
        standardShip = { ...standardShip, arrivalDate: domShip.arrivalDate };
    }
    if (standardShip && standardShip.cents == null && domShip && domShip.cents != null) {
        standardShip = { ...standardShip, cents: domShip.cents };
    }
    const needsSize = sizes.length > 1 && !selectedSize && !(standardShip && standardShip.arrivalDate);
    const anySellable = choices.some((choice) => (choice.items || []).some((item) => nordstromOffer(item).sellable));
    const inStock = offers.length > 0 ? true : (looked.length > 0 ? false : (anySellable ? null : false));
    const shipNote = standardShip && standardShip.cents === 0
        ? (needsSize ? 'Free standard shipping. Delivery date needs a size.' : 'Free standard shipping.')
        : '';
    if (standardShip && standardShip.cents === 0) standardShip = { ...standardShip, note: shipNote };

    const page = (config.productDisplay?.pageData?.entities || {})[id] || {};
    const crumbs = (page.breadcrumb || []).map((crumb) => crumb.name).filter((name) => name && name !== 'Home');
    const imageUrl = (selectedChoice && nordstromChoiceImage(selectedChoice)) || imageFallback(html);
    return {
        title: String(entity.copyProductTitle || '').trim(),
        brand: String(entity.labelDisplayName || '').trim(),
        imageUrl,
        category: crumbs.join(' / '),
        packageDimensions: null,
        pagePriceCents,
        standardShip: standardShip || { cents: null, arrivalDate: null, note: '' },
        pageNotes: needsSize ? ['Delivery date needs a size.'] : [],
        inStock,
        isElectronics: looksElectronic('nordstrom', entity.copyProductTitle, crumbs.join(' ')),
        variantGroups: cleanVariantGroups(groups),
        choicePrompt: pagePriceCents == null && !groups.some((group) => (group.options || []).length > 1)
            ? 'Choose a size and color on the product page, then add the link again.'
            : '',
    };
}

function geminiKey() {
    return String(process.env.GEMINI_API_KEY || '').trim();
}

function parseGeminiJson(text) {
    const raw = String(text || '').trim();
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = fenced ? fenced[1] : raw;
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try { return JSON.parse(body.slice(start, end + 1)); } catch { return null; }
}

/** Asks Gemini to open a public product URL. Used when the retailer sends our server a bot page. */
async function askGeminiProduct(url, zip) {
    const key = geminiKey();
    if (!key) return null;
    const prompt = [
        'Read the selected product on this page. Ignore sidebar ads and other products.',
        url,
        zip ? `The shopper ZIP is ${zip}.` : '',
        'Reply with JSON only: {"title":"","priceUsd":null,"compareAtUsd":null,"shippingUsd":null,"arrivalDate":null,"shipToZip":null}',
        'priceUsd is the price the shopper would pay now for the selected color and size. If the page shows New Markdown, a sale price, or a lower price next to a crossed-out price, use that lower price. Do not use the crossed-out price.',
        'compareAtUsd is the crossed-out original price, or null when there is none.',
        'If the page shows one current price for that selection, return that number. If it only shows a range and no size or color is selected, set priceUsd to null.',
        'shippingUsd is standard shipping to the shopper ZIP. Use 0 when that shipping is free.',
        'arrivalDate is the standard arrival date for that selection. "Free arrives Tue, Oct 20" is 2026-10-20. "Arrives between Thu, Oct 15 and Fri, Oct 16" is the last day, 2026-10-16. If the year is missing and the date is still ahead, use 2026.',
        'shipToZip is the 5-digit ZIP shown next to Shipping to. Use null when no ZIP is shown.',
        'Do not leave priceUsd or arrivalDate null when the page shows them. Do not use a sidebar or recommendation price.',
    ].filter(Boolean).join(' ');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 28000);
    try {
        const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent', {
            method: 'POST',
            headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                tools: [{ url_context: {} }],
            }),
            signal: ctrl.signal,
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
        const facts = parseGeminiJson(parts.map((part) => part.text || '').join('\n'));
        const title = String((facts && facts.title) || '').trim();
        if (!title) return null;
        const price = Number(facts.priceUsd);
        const compareAt = Number(facts.compareAtUsd);
        let pagePriceCents = Number.isFinite(price) && price > 0 ? Math.round(price * 100) : null;
        if (Number.isFinite(compareAt) && compareAt > 0 && pagePriceCents && Math.round(compareAt * 100) < pagePriceCents) {
            pagePriceCents = Math.round(compareAt * 100);
        }
        const ship = Number(facts.shippingUsd);
        const shipCents = facts.shippingUsd === 0 || ship === 0
            ? 0
            : (Number.isFinite(ship) && ship > 0 ? Math.round(ship * 100) : null);
        const shipToZip = /^\d{5}$/.test(String(facts.shipToZip || '')) ? String(facts.shipToZip) : '';
        const zipMismatch = !!(zip && shipToZip && shipToZip !== String(zip));
        const arrival = zipMismatch ? null : (/^\d{4}-\d{2}-\d{2}$/.test(String(facts.arrivalDate || '')) ? String(facts.arrivalDate) : null);
        const choicePrompt = zipMismatch
            ? `This page ships to ${shipToZip}. Set the page to ${zip}, then add the link again.`
            : (pagePriceCents == null ? 'Choose a size and color on the product page, then add the link again.' : '');
        return {
            title: title.slice(0, 300),
            brand: '',
            imageUrl: '',
            category: '',
            packageDimensions: null,
            pagePriceCents,
            standardShip: {
                cents: shipCents,
                arrivalDate: arrival,
                note: shipCents === 0 ? 'Free standard shipping.' : '',
            },
            pageNotes: [],
            inStock: null,
            isElectronics: looksElectronic('nordstrom', title),
            variantGroups: [],
            choicePrompt,
            readBy: 'gemini',
        };
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function savedPageHtml(retailerId, url, { batchId, lineId } = {}) {
    try {
        if (!fs.existsSync(EXTERNAL_PAGES_DIR)) return null;
        const parsed = retailers.parseProductLink(url);
        const productId = (parsed && parsed.productId) || nordstromStyleId(url) || '';
        const candidates = [
            batchId && lineId ? `${batchId}-${lineId}.html` : '',
            lineId ? `${lineId}.html` : '',
            productId ? `${retailerId}-${productId}.html` : '',
            productId ? `${productId}.html` : '',
            `${retailerId}.html`,
        ].filter(Boolean);
        for (const name of candidates) {
            const fp = path.join(EXTERNAL_PAGES_DIR, name);
            if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
                const html = fs.readFileSync(fp, 'utf8').slice(0, MAX_BYTES);
                if (html.trim() && !nordstromShell(html)) return html;
            }
        }
        const files = fs
            .readdirSync(EXTERNAL_PAGES_DIR)
            .filter((f) => /\.html?$/i.test(f))
            .map((f) => ({ name: f, fp: path.join(EXTERNAL_PAGES_DIR, f), mtime: fs.statSync(path.join(EXTERNAL_PAGES_DIR, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);
        for (const f of files) {
            if (productId && f.name.includes(productId)) {
                const html = fs.readFileSync(f.fp, 'utf8').slice(0, MAX_BYTES);
                if (html.trim() && !nordstromShell(html)) return html;
            }
        }
        if (productId) {
            for (const f of files) {
                const html = fs.readFileSync(f.fp, 'utf8').slice(0, MAX_BYTES);
                if (html.includes(productId) && !nordstromShell(html)) return html;
            }
        }
        return null;
    } catch (_) {
        return null;
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readProduct({ retailer, url, zip, state, batchId, lineId }) {
    const r = retailers.byId(retailer);
    if (!r) return { ok: false, reason: 'retailer_not_supported', needsPerson: false };
    const savedHtml = savedPageHtml(retailer, url, { batchId, lineId });
    let page;
    if (savedHtml) {
        page = { ok: true, html: savedHtml, finalUrl: url, fromSavedPage: true };
    } else {
        try {
            page = await fetchPage(retailer, url);
            // Kohl's / Nordstrom / Best Buy blocks are often brief. One quiet retry
            // recovers more often than sending the shopper straight to manual add.
            if (!pageIsUsable(retailer, page) && ZENROWS_RETAILERS.has(retailer)) {
                await sleep(2000);
                page = await fetchPage(retailer, url);
            }
        } catch (e) {
            return { ok: false, reason: `fetch_failed: ${e && e.message ? e.message : e}`, needsPerson: true };
        }
    }
        if (!page.ok) return { ok: false, reason: page.reason, needsPerson: false };
    if (retailer === 'nordstrom') {
        const parsed = nordstromShell(page.html) ? null : nordstromFromHtml(page.html, url, zip);
        const product = parsed || (page.fromSavedPage ? null : await askGeminiProduct(url, zip));
        if (product) {
            if (product.pagePriceCents) product.pagePriceCents = struckSaleCents(page.html, product.pagePriceCents);
            const amazonCategory = await categories.categorize({
                retailer,
                retailerName: r.name,
                html: page.html,
                title: product.title,
                brand: product.brand,
                category: product.category,
            });
            const ship = product.standardShip && product.standardShip.arrivalDate
                ? product.standardShip
                : (() => {
                    const printed = standardFromPage(page.html, product.pagePriceCents || 0);
                    const base = product.standardShip || { cents: null, arrivalDate: null, note: '' };
                    return printed && printed.arrivalDate ? { ...base, arrivalDate: printed.arrivalDate, cents: base.cents != null ? base.cents : printed.cents } : base;
                })();
            const pageOffer = product.pagePriceCents && ship && ship.cents != null
                ? { itemPriceCents: product.pagePriceCents, shippingOptions: [ship] }
                : null;
            return {
                ok: true,
                product: {
                    ...product,
                    standardShip: ship,
                    amazonCategory,
                    pageOffer,
                    choicePrompt: product.choicePrompt || '',
                    readAt: new Date().toISOString(),
                    readBy: page.fromSavedPage ? 'saved_page' : (product.readBy || 'nordstrom'),
                },
            };
        }
        if (nordstromShell(page.html)) return { ok: false, reason: 'blocked', needsPerson: true };
    }
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
    if (facts && facts.kind === 'list' && !retailers.parseProductLink(url).ok) {
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
        const button = await targetFulfillment(page.html, { zip, state, referer: url });
        if (button && (button.arrivalDate || button.cents != null)) {
            chosen = {
                label: 'Standard shipping',
                cents: button.cents != null ? button.cents : chosen && chosen.cents != null ? chosen.cents : null,
                arrivalDate: button.arrivalDate || (chosen && chosen.arrivalDate) || null,
                note: (chosen && chosen.note) || '',
            };
        }
        if (chosen && chosen.cents === 0 && (pagePriceCents || 0) < 3500 && /\$35\s+orders|orders\s+over\s+\$35|with\s+\$35/i.test(page.html)) {
            chosen = { ...chosen, cents: null, note: 'Free on orders over $35' };
        }
    }
    let choicePrompt = '';
    let zipChecked = false;
    if (retailer === 'bestbuy') {
        const bby = bestbuyShip(page.html, zip);
        if (bby) {
            chosen = bby;
            zipChecked = true;
        } else {
            const seen = pageShipZip(page.html);
            if (seen && seen !== String(zip || '').replace(/\D/g, '').slice(0, 5)) {
                choicePrompt = zipMismatchPrompt(zip, seen);
            } else {
                zipChecked = true;
                chosen = { label: 'Standard shipping', cents: null, arrivalDate: null, note: '' };
            }
        }
    }
    if (retailer === 'walmart') {
        const wship = walmartShip(page.html, zip);
        if (wship && wship.skip) chosen = null;
        else if (wship) {
            chosen = { label: 'Standard shipping', cents: wship.cents, arrivalDate: wship.arrivalDate, note: wship.note || '' };
            choicePrompt = wship.choicePrompt || '';
            zipChecked = !choicePrompt;
        }
    }
    if (!choicePrompt && !zipChecked) {
        const seenZip = pageShipZip(page.html) || (/^\d{5}$/.test(String(facts.shipToZip || '')) ? String(facts.shipToZip) : '');
        choicePrompt = zipMismatchPrompt(zip, seenZip);
    }
    if (choicePrompt) chosen = null;
    if (!choicePrompt) chosen = withDefaultShip(retailer, chosen, pagePriceCents || 0);
    if (chosen && !chosen.arrivalDate) {
        const printed = standardFromPage(page.html, pagePriceCents || 0);
        if (printed && printed.arrivalDate) chosen = { ...chosen, arrivalDate: printed.arrivalDate };
    }
    const indicated = /^\d{4}-\d{2}-\d{2}$/.test(String(facts.standardShipping && facts.standardShipping.arrivalDate || ''))
        ? String(facts.standardShipping.arrivalDate)
        : '';
    if (!choicePrompt && indicated && (!chosen || !chosen.arrivalDate)) {
        chosen = { label: 'Standard shipping', cents: chosen && chosen.cents != null ? chosen.cents : null, arrivalDate: indicated, note: (chosen && chosen.note) || '' };
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
            variantGroups: retailer === 'kohls'
                ? applyKohlsColors(cleanVariantGroups(facts.variantGroups), page.html, url)
                : cleanVariantGroups(facts.variantGroups),
            choicePrompt,
            readAt: new Date().toISOString(),
            readBy: page.fromSavedPage ? 'saved_page' : 'grok',
        },
    };
}

module.exports = {
    readProduct, askGrok, looksElectronic, priceAppearsInPage, jsonLdProducts, visibleText, fetchPage, usablePage, DIRECT_MS, standardFromPage, walmartShip, bestbuyShip, pageShipZip, zipMismatchPrompt, kohlsSkuColor, kohlsColorNames, applyKohlsColors, withDefaultShip, targetFulfillment,
    nordstromShell, nordstromFromHtml, struckSaleCents, savedPageHtml, EXTERNAL_PAGES_DIR,
};
