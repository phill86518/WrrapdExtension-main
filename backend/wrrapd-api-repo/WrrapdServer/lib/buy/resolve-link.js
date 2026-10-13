/**
 * Opens a pasted link when the URL itself is not a product id.
 * Rye does this before it quotes: follow the link, and keep it only when the
 * page is one product. A promo list or search stays a list.
 */
const retailers = require('./retailers');
const pageReader = require('./page-reader');
const grokClient = require('../grok-client');

const SHORT_HOSTS = ['a.co', 'amzn.to'];

function decode(s) {
    return String(s || '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .trim();
}

function hostOf(raw) {
    try {
        return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/\.$/, '');
    } catch (_) {
        return '';
    }
}

function listingPath(raw) {
    let path = '';
    try {
        path = new URL(raw).pathname.toLowerCase();
    } catch (_) {
        return false;
    }
    return /^\/(pl|s|b|c|f|search|browse|cp|gp\/browse|gp\/goldbox)(\/|$)/.test(path);
}

function metaHref(html, relOrProp) {
    const re = new RegExp(`<link[^>]+rel=["']${relOrProp}["'][^>]*href=["']([^"']+)["']`, 'i');
    const re2 = new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]*rel=["']${relOrProp}["']`, 'i');
    const meta = new RegExp(`<meta[^>]+property=["']${relOrProp}["'][^>]*content=["']([^"']+)["']`, 'i');
    const m = html.match(re) || html.match(re2) || html.match(meta);
    return m ? decode(m[1]) : '';
}

function jsonLdUrls(html) {
    const urls = [];
    const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html)) && urls.length < 8) {
        try {
            const data = JSON.parse(m[1].trim());
            const stack = Array.isArray(data) ? data.slice() : [data];
            while (stack.length && urls.length < 8) {
                const node = stack.shift();
                if (!node || typeof node !== 'object') continue;
                if (Array.isArray(node['@graph'])) stack.push(...node['@graph']);
                const t = node['@type'];
                const product = t === 'Product' || t === 'ProductGroup' || (Array.isArray(t) && t.includes('Product'));
                if (product && typeof node.url === 'string') urls.push(node.url);
            }
        } catch (_) {
            /* ignore */
        }
    }
    return urls;
}

function idAppears(html, id) {
    return id && html.toLowerCase().includes(String(id).toLowerCase());
}

/** Accepts a product URL or id only when Grok read it off the page and the page contains it. */
function acceptGrokProduct(facts, html, allowedIds, retailer) {
    if (!facts || facts.kind === 'list') return null;
    const tries = [];
    if (facts.productUrl) tries.push(String(facts.productUrl));
    if (facts.productId && retailer && idAppears(html, facts.productId)) {
        try {
            tries.push(retailer.canonical(String(facts.productId)));
        } catch (_) {
            /* ignore */
        }
    }
    for (const candidate of tries) {
        const again = retailers.parseProductLink(candidate, allowedIds);
        if (again.ok && (idAppears(html, again.productId) || html.includes(again.productId))) return again;
    }
    return null;
}

function shouldOpen(parsed, raw) {
    if (parsed.ok) return false;
    if (parsed.reason === 'not_a_product_page') return true;
    return SHORT_HOSTS.includes(hostOf(raw));
}

/**
 * @returns {Promise<object>} same shape as retailers.parseProductLink, plus product_list
 */
async function resolveLink(raw, allowedIds) {
    const parsed = retailers.parseProductLink(raw, allowedIds);
    if (!shouldOpen(parsed, raw)) return parsed;
    const retailer = retailers.byId(parsed.retailer);
    const extraHosts = [
        ...SHORT_HOSTS,
        ...retailers.RETAILERS.flatMap((r) => r.hosts),
    ];
    let page;
    try {
        page = await pageReader.fetchPage(retailer ? retailer.id : 'amazon', raw, extraHosts);
    } catch (_) {
        return parsed;
    }
    if (!page.ok) return parsed;
    const candidates = [page.finalUrl, metaHref(page.html, 'canonical'), metaHref(page.html, 'og:url'), ...jsonLdUrls(page.html)];
    for (const candidate of candidates) {
        if (!candidate) continue;
        const again = retailers.parseProductLink(candidate, allowedIds);
        if (again.ok) return again;
    }
    if (grokClient.isConfigured()) {
        try {
            const { facts } = await pageReader.askGrok({
                retailerName: retailer ? retailer.name : 'store',
                url: page.finalUrl || raw,
                html: page.html,
            });
            const fromGrok = acceptGrokProduct(facts, page.html, allowedIds, retailer);
            if (fromGrok) return fromGrok;
            if (facts && facts.kind === 'list') {
                return {
                    ok: false,
                    reason: 'product_list',
                    retailer: parsed.retailer || '',
                    retailerName: retailer ? retailer.name : '',
                };
            }
        } catch (_) {
            /* structural result stands */
        }
    }
    if (listingPath(page.finalUrl) || listingPath(raw)) {
        return {
            ok: false,
            reason: 'product_list',
            retailer: parsed.retailer || '',
            retailerName: retailer ? retailer.name : '',
        };
    }
    return parsed;
}

module.exports = { resolveLink, listingPath };
