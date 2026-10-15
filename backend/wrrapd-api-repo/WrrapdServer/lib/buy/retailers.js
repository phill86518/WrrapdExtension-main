/**
 * Retailers the "We buy it for you" page accepts, with strict link checks.
 * `trackingName` must match tracking-platform OrderRetailer exactly.
 */

const RETAILERS = [
    {
        id: 'amazon',
        name: 'Amazon',
        trackingName: 'Amazon',
        hosts: ['amazon.com', 'www.amazon.com', 'smile.amazon.com'],
        productId: (u) => (u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/i) || [])[1],
        canonical: (id) => `https://www.amazon.com/dp/${id.toUpperCase()}`,
    },
    {
        id: 'target',
        name: 'Target',
        trackingName: 'Target',
        hosts: ['target.com', 'www.target.com'],
        productId: (u) => (u.pathname.match(/\/A-(\d{6,10})(?:[/?#]|$)/) || [])[1],
        canonical: (id) => `https://www.target.com/p/-/A-${id}`,
    },
    {
        id: 'walmart',
        name: 'Walmart',
        trackingName: 'Walmart',
        hosts: ['walmart.com', 'www.walmart.com'],
        productId: (u) => (u.pathname.match(/\/ip\/(?:[^/]+\/)?(\d{5,14})(?:[/?#]|$)/) || [])[1],
        canonical: (id) => `https://www.walmart.com/ip/${id}`,
    },
    {
        id: 'lego',
        name: 'LEGO',
        trackingName: 'Lego',
        hosts: ['lego.com', 'www.lego.com'],
        productId: (u) => (u.pathname.match(/\/product\/([a-z0-9-]*?\d{4,7})(?:[/?#]|$)/i) || [])[1],
        canonical: (id) => `https://www.lego.com/en-us/product/${id.toLowerCase()}`,
    },
    {
        id: 'ulta',
        name: 'Ulta',
        trackingName: 'Ulta',
        hosts: ['ulta.com', 'www.ulta.com'],
        productId: (u) => (u.pathname.match(/\/p\/([a-z0-9-]*(?:pimprod|xlsimpprod)\d+)(?:\/|$)/i) || [])[1],
        canonical: (id) => `https://www.ulta.com/p/${id.toLowerCase()}`,
    },
    {
        id: 'nordstrom',
        name: 'Nordstrom',
        trackingName: 'Nordstrom',
        hosts: ['nordstrom.com', 'www.nordstrom.com'],
        productId: (u) => (u.pathname.match(/\/s\/(?:[^/]+\/)?(\d{5,10})(?:[/?#]|$)/) || [])[1],
        canonical: (id) => `https://www.nordstrom.com/s/${id}`,
    },
    {
        id: 'kohls',
        name: "Kohl's",
        trackingName: "Kohl's",
        hosts: ['kohls.com', 'www.kohls.com'],
        productId: (u) => (u.pathname.match(/\/product\/prd-(\d{4,10})(?:[/.?#]|$)/) || [])[1],
        canonical: (id) => `https://www.kohls.com/product/prd-${id}`,
    },
    {
        id: 'sephora',
        name: 'Sephora',
        trackingName: 'Sephora',
        hosts: ['sephora.com', 'www.sephora.com'],
        productId: (u) => (u.pathname.match(/\/product\/(?:[^/]+-)?(P\d{4,8})(?:[/?#]|$)/i) || [])[1],
        canonical: (id) => `https://www.sephora.com/product/${id.toUpperCase()}`,
    },
    {
        id: 'bestbuy',
        name: 'Best Buy',
        trackingName: 'Best Buy',
        hosts: ['bestbuy.com', 'www.bestbuy.com'],
        productId: (u) =>
            (u.pathname.match(/\/(\d{7})\.p(?:[/?#]|$)/) || [])[1] ||
            (u.pathname.match(/\/site\/[^/]+\/(\d{7})(?:[/.?#]|$)/) || [])[1] ||
            (u.searchParams.get('skuId') || '').replace(/\D/g, '').slice(0, 7) ||
            undefined,
        canonical: (id) => `https://www.bestbuy.com/site/${id}.p?skuId=${id}`,
    },
    {
        id: 'etsy',
        name: 'Etsy',
        trackingName: 'Etsy',
        hosts: ['etsy.com', 'www.etsy.com'],
        productId: (u) => (u.pathname.match(/\/listing\/(\d{6,12})(?:[/?#]|$)/) || [])[1],
        canonical: (id) => `https://www.etsy.com/listing/${id}`,
    },
];

const ALL_IDS = RETAILERS.map((r) => r.id);
const BY_ID = Object.fromEntries(RETAILERS.map((r) => [r.id, r]));

function byId(id) {
    return BY_ID[String(id || '')] || null;
}

/** Short links (a.co, amzn.to, etc.) can hide another site, so they are refused. */
function parseProductLink(raw, allowedIds) {
    const text = String(raw || '').trim();
    if (!text) return { ok: false, reason: 'empty' };
    if (text.length > 2000) return { ok: false, reason: 'too_long' };
    let u;
    try {
        u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    } catch (_) {
        return { ok: false, reason: 'not_a_link' };
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: 'not_a_link' };
    if (u.username || u.password || (u.port && u.port !== '443' && u.port !== '80')) {
        return { ok: false, reason: 'not_a_link' };
    }
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    const retailer = RETAILERS.find((r) => r.hosts.includes(host));
    if (!retailer) return { ok: false, reason: 'retailer_not_supported' };
    if (Array.isArray(allowedIds) && !allowedIds.includes(retailer.id)) {
        return { ok: false, reason: 'retailer_not_supported', retailer: retailer.id };
    }
    const productId = retailer.productId(u);
    if (!productId) return { ok: false, reason: 'not_a_product_page', retailer: retailer.id };
    const sku = retailer.id === 'ulta' ? String(u.searchParams.get('sku') || '') : '';
    if (sku && !/^\d{4,12}$/.test(sku)) u.searchParams.delete('sku');
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) {
        if (/^(utm_|ref|tag|linkcode|ascsubtag|clickid|irclickid|cid|psc_|afsrc|wmlspartner|sourceid|campaign)/i.test(k)) {
            u.searchParams.delete(k);
        }
    }
    u.protocol = 'https:';
    return {
        ok: true,
        retailer: retailer.id,
        retailerName: retailer.name,
        productId,
        canonicalUrl: retailer.id === 'ulta' && /^\d{4,12}$/.test(sku) ? `${retailer.canonical(productId)}?sku=${sku}` : retailer.canonical(productId),
        url: u.toString(),
    };
}

function normalizeUrl(raw) {
    try {
        const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
        u.hash = '';
        u.protocol = 'https:';
        u.hostname = u.hostname.toLowerCase().replace(/\.$/, '');
        for (const k of [...u.searchParams.keys()]) {
            if (/^(utm_|ref|tag|linkcode|ascsubtag|clickid|irclickid|cid|psc_|afsrc|wmlspartner|sourceid|campaign)/i.test(k)) u.searchParams.delete(k);
        }
        return u.toString();
    } catch (_) {
        return String(raw || '').trim();
    }
}

function publicList(allowedIds) {
    return RETAILERS.filter((r) => !allowedIds || allowedIds.includes(r.id)).map((r) => ({ id: r.id, name: r.name }));
}

module.exports = { RETAILERS, ALL_IDS, byId, parseProductLink, normalizeUrl, publicList };
