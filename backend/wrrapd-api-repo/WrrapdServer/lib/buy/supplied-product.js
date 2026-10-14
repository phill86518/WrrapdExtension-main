/**
 * Product facts handed to the cart from outside the page reader.
 * Prices are the unit price. Shipping may be 0. The arrival date is optional.
 */
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function dollarsToCents(value) {
    if (value == null || value === '') return null;
    const s = String(value).trim().replace(/[$,\s]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    const n = Math.round(Number(s) * 100);
    return n >= 0 && n < 10000000 ? n : null;
}

function centsField(cents, usd) {
    if (cents != null && cents !== '') {
        const n = Math.round(Number(cents));
        if (!Number.isInteger(n) || n < 0 || n >= 10000000) return null;
        return n;
    }
    return dollarsToCents(usd);
}

function arrivalDate(value, now) {
    const s = String(value || '').trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
        return s;
    }
    const match = s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?/i);
    if (!match) return null;
    const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
    const day = Number(match[2]);
    let year = match[3] ? Number(match[3]) : now.getUTCFullYear();
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
    if (!match[3]) {
        const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        if (dt.getTime() < today) year += 1;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function variantLabel(facts) {
    const direct = String(facts.variantLabel || facts.variant || '').trim();
    if (direct) return direct.slice(0, 200);
    const parts = [];
    const color = String(facts.color || '').trim();
    const size = String(facts.size || '').trim();
    if (color) parts.push(`Color: ${color}`);
    if (size) parts.push(`Size: ${size}`);
    return parts.join(', ').slice(0, 200);
}

function build(facts, now = new Date()) {
    const src = facts && typeof facts === 'object' ? facts : {};
    const title = String(src.title || '').trim().slice(0, 300);
    if (!title) return { ok: false, error: 'A product title is required.' };
    const pagePriceCents = centsField(src.priceCents, src.priceUsd != null ? src.priceUsd : src.price);
    if (!pagePriceCents) return { ok: false, error: 'A unit price is required.' };
    const hasShip = src.shippingCents != null || src.shippingUsd != null || src.shipping != null;
    const shipCents = hasShip ? centsField(src.shippingCents, src.shippingUsd != null ? src.shippingUsd : src.shipping) : null;
    if (hasShip && shipCents == null) return { ok: false, error: 'Shipping cost must be a price, or 0 when shipping is free.' };
    const rawDate = src.arrivalDate != null ? src.arrivalDate : src.arrives;
    const arrival = rawDate ? arrivalDate(rawDate, now) : null;
    if (rawDate && !arrival) return { ok: false, error: 'Arrival date must look like 2026-10-20 or Oct 20.' };
    let imageUrl = String(src.imageUrl || '').trim();
    if (imageUrl && !/^https:\/\//.test(imageUrl)) return { ok: false, error: 'imageUrl must be an https link.' };
    imageUrl = imageUrl.slice(0, 1000);
    const ship = hasShip || arrival
        ? { cents: shipCents, arrivalDate: arrival, note: shipCents === 0 ? 'Free standard shipping.' : '' }
        : null;
    return {
        ok: true,
        variantLabel: variantLabel(src),
        product: {
            title,
            brand: String(src.brand || '').trim().slice(0, 120),
            imageUrl,
            category: String(src.category || '').trim().slice(0, 120),
            packageDimensions: null,
            pagePriceCents,
            standardShip: ship,
            pageNotes: [],
            inStock: src.inStock === false ? false : true,
            isElectronics: src.isElectronics === true,
            variantGroups: [],
            choicePrompt: '',
            pageOffer: ship && ship.cents != null ? { itemPriceCents: pagePriceCents, shippingOptions: [ship] } : null,
            readAt: now.toISOString(),
            readBy: 'supplied',
        },
    };
}

module.exports = { build, arrivalDate, centsField };
