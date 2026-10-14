/**
 * Bill for a "We buy it for you" batch, all in cents and always computed on the server.
 *   per retailer: item prices + the chosen shipping option (retailer's price, passed through) + retailer tax
 *   plus Wrrapd service: gift-wrap on every item, design, flowers, box, tax on the service (existing pricing)
 * Items that reach the hub on the same day form one bundle (one wrap job and one delivery).
 */
const crypto = require('crypto');
const wrrapdPricing = require('../wrrapd-pricing');
const flowerCatalog = require('../flowers/catalog');
const printerCoverage = require('../printer-coverage');

const WRAP_STYLES = new Set(['wrrapd', 'ai', 'upload']);

function selectedOption(group) {
    const opts = (group && group.quote && Array.isArray(group.quote.shippingOptions) && group.quote.shippingOptions) || [];
    if (!opts.length) return null;
    const hit = opts.find((o) => o.id === group.selectedShippingId);
    if (hit) return hit;
    return opts.slice().sort((a, b) => a.cents - b.cents || String(a.arrivalDate || '9').localeCompare(String(b.arrivalDate || '9')))[0];
}

function groupTax(group, option) {
    if (option && Number.isInteger(option.taxCents) && option.taxCents >= 0) return option.taxCents;
    const t = group && group.quote ? group.quote.taxCents : null;
    return Number.isInteger(t) && t >= 0 ? t : null;
}

function readyLines(batch) {
    return (batch.lines || []).filter((l) => l.state === 'ready' && !l.removed);
}

function linePriceCents(batch, line) {
    const g = batch.groups && batch.groups[line.retailer];
    const c = g && g.quote && g.quote.itemPrices ? g.quote.itemPrices[line.id] : null;
    return Number.isInteger(c) && c > 0 ? c : null;
}

function lineQty(line) {
    const n = Math.round(Number(line && line.qty));
    if (!Number.isInteger(n) || n < 1) return 1;
    return Math.min(5, n);
}

function wrapOptionFor(line) {
    const w = line.wrap || {};
    const style = WRAP_STYLES.has(w.style) ? w.style : 'wrrapd';
    const fl = w.flowers && w.flowers.offerId ? w.flowers : null;
    return {
        title: line.product ? line.product.title : '',
        itemCategory: line.product ? line.product.category : '',
        checkbox_wrrapd: true,
        selected_wrapping_option: style,
        checkbox_flowers: !!fl,
        flower_offer_id: fl ? String(fl.offerId) : null,
        flower_amount: fl ? Number(fl.amount) : null,
    };
}

function pricedWrap(lines, gifteeZip, { discountAware }) {
    const cart = wrrapdPricing.sanitizePricingCartFromRequest({
        items: lines.map((l) => {
            const opt = wrapOptionFor(l);
            return { title: opt.title, itemCategory: opt.itemCategory, options: [opt] };
        }),
        postalCode: gifteeZip,
        country: 'US',
        multiItemDiscountAware: discountAware,
    });
    if (!cart) return { ok: false, error: 'wrap_cart_invalid' };
    for (const item of cart.items) {
        for (const opt of item.options) {
            if (!opt.checkbox_flowers) continue;
            const chk = flowerCatalog.validateOfferAmount(opt.flower_offer_id, opt.flower_amount);
            if (!chk.ok) return { ok: false, error: 'flowers_expired' };
            opt.flower_amount = chk.offer.chargedPrice;
        }
    }
    const r = wrrapdPricing.computeTotalCentsFromPricingCart(cart);
    if (!r.ok) return { ok: false, error: r.error || 'wrap_pricing_failed' };
    return { ok: true, r };
}

const cents = (usd) => Math.round(Number(usd || 0) * 100);

function wrapBreakdown(lines, gifteeZip) {
    if (!lines.length) {
        return { ok: true, giftWrapCents: 0, discountCents: 0, designAiCents: 0, designUploadCents: 0, flowersCents: 0, boxCents: 0, serviceTaxCents: 0, totalCents: 0, perLine: {} };
    }
    const all = pricedWrap(lines, gifteeZip, { discountAware: true });
    if (!all.ok) return all;
    const b = all.r.breakdown;
    const perLine = {};
    const discountCents = cents(b.multiItemDiscount);
    let discountLeft = discountCents;
    lines.forEach((l, i) => {
        const one = pricedWrap([l], gifteeZip, { discountAware: false });
        const ob = one.ok ? one.r.breakdown : { giftWrapTotal: 0, designAiTotal: 0, designUploadTotal: 0, flowersTotal: 0, boxTotal: 0 };
        const share = i === lines.length - 1 ? discountLeft : Math.floor(discountCents / lines.length);
        discountLeft -= share;
        perLine[l.id] = {
            wrapBaseCents: cents(ob.giftWrapTotal),
            wrapDiscountCents: share,
            designCents: cents(ob.designAiTotal) + cents(ob.designUploadTotal),
            boxCents: cents(ob.boxTotal),
            flowersCents: cents(ob.flowersTotal),
        };
    });
    return {
        ok: true,
        giftWrapCents: cents(b.giftWrapTotal),
        giftWrapCount: b.giftWrapCount,
        discountCents,
        discountPercent: b.multiItemDiscountPercent || 0,
        designAiCents: cents(b.designAiTotal),
        designUploadCents: cents(b.designUploadTotal),
        flowersCents: cents(b.flowersTotal),
        boxCents: cents(b.boxTotal),
        serviceTaxCents: cents(all.r.estimatedTax),
        serviceTaxPercent: all.r.taxRatePercent,
        totalCents: all.r.cents,
        perLine,
    };
}

function ymdPlusOne(ymd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return null;
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Bundles by the day items reach the hub. `arrivalFor(line)` returns YYYY-MM-DD or null.
 * Lines without a date share one "date to be confirmed" bundle.
 */
function bundlesFor(lines, arrivalFor) {
    const map = new Map();
    for (const l of lines) {
        const d = arrivalFor(l) || null;
        const key = d || 'unknown';
        if (!map.has(key)) map.set(key, { arrivalDate: d, deliveryDate: ymdPlusOne(d), lineIds: [] });
        map.get(key).lineIds.push(l.id);
    }
    return [...map.values()].sort((a, b) => String(a.arrivalDate || '9999').localeCompare(String(b.arrivalDate || '9999')));
}

/**
 * @returns {{ ok: true, bill: object } | { ok: false, error: string, message?: string }}
 */
function computeBill(batch, cfg) {
    const lines = readyLines(batch);
    if (!lines.length) return { ok: false, error: 'no_ready_items', message: 'Add at least one item we can buy.' };
    const customOk = printerCoverage.publicAvailability(batch.gifteeZip).available === true;
    for (const l of lines) {
        const style = l.wrap && l.wrap.style;
        if ((style === 'ai' || style === 'upload') && !customOk) {
            return { ok: false, error: 'custom_design_unavailable', message: 'Custom designs are not available for this ZIP code. Please choose Wrrapd paper.' };
        }
    }
    const groups = [];
    let merchandiseCents = 0;
    for (const retailerId of [...new Set(lines.map((l) => l.retailer))]) {
        const g = batch.groups[retailerId];
        const gl = lines.filter((l) => l.retailer === retailerId);
        const opt = selectedOption(g);
        const tax = groupTax(g, opt);
        if (!opt || tax == null) return { ok: false, error: 'quote_incomplete', message: 'Prices are still being checked.' };
        const items = [];
        for (const l of gl) {
            const p = linePriceCents(batch, l);
            if (p == null) return { ok: false, error: 'quote_incomplete', message: 'Prices are still being checked.' };
            if (p > cfg.perItemCapCents) return { ok: false, error: 'over_item_limit', message: `This item is over the purchase limit ($${(p / 100).toFixed(2)} versus $${(cfg.perItemCapCents / 100).toFixed(2)}).`, lineId: l.id };
            const qty = lineQty(l);
            const extended = p * qty;
            merchandiseCents += extended;
            items.push({ lineId: l.id, title: l.product.title, variant: l.variantLabel || '', imageUrl: l.product.imageUrl || '', cents: extended, unitCents: p, qty });
        }
        groups.push({
            retailer: retailerId,
            retailerName: g.retailerName,
            items,
            shipping: { id: opt.id, label: opt.label, cents: opt.cents, arrivalDate: opt.arrivalDate || null },
            shippingOptions: g.quote.shippingOptions.map((o) => ({ id: o.id, label: o.label, cents: o.cents, arrivalDate: o.arrivalDate || null })),
            taxCents: tax,
            subtotalCents: items.reduce((s, i) => s + i.cents, 0) + opt.cents + tax,
            quotedAt: g.quote.at,
        });
    }
    if (merchandiseCents > cfg.merchandiseCapCents) {
        return { ok: false, error: 'over_limit', message: 'These items are over the Purchase Limit. Please remove an item.' };
    }
    const wrap = wrapBreakdown(lines, batch.gifteeZip);
    if (!wrap.ok) {
        return {
            ok: false,
            error: wrap.error,
            message: wrap.error === 'flowers_expired' ? 'The flower choice expired. Please choose flowers again.' : 'Gift-wrap could not be priced. Please try again.',
        };
    }
    const retailerCents = groups.reduce((s, g) => s + g.subtotalCents, 0);
    const arrival = Object.fromEntries(groups.map((g) => [g.retailer, g.shipping.arrivalDate]));
    const bundles = bundlesFor(lines, (l) => arrival[l.retailer]);
    const bill = {
        computedAt: new Date().toISOString(),
        groups,
        merchandiseCents,
        retailerCents,
        wrap,
        totalCents: retailerCents + wrap.totalCents,
        bundles: bundles.map((b) => ({ ...b, titles: b.lineIds.map((id) => lines.find((l) => l.id === id).product.title) })),
    };
    bill.hash = billHash(bill);
    return { ok: true, bill };
}

function billHash(bill) {
    const material = JSON.stringify({
        g: bill.groups.map((g) => [g.retailer, g.items.map((i) => [i.lineId, i.cents]), g.shipping.id, g.shipping.cents, g.taxCents]),
        w: [bill.wrap.giftWrapCents, bill.wrap.discountCents, bill.wrap.designAiCents, bill.wrap.designUploadCents, bill.wrap.flowersCents, bill.wrap.boxCents, bill.wrap.serviceTaxCents],
        t: bill.totalCents,
    });
    return crypto.createHash('sha256').update(material).digest('hex').slice(0, 32);
}

/** Shopper messages when a refreshed cost page differs from the one they saw. */
function changeMessages(prevQuote, nextQuote, group, lines) {
    const out = [];
    if (!prevQuote || !nextQuote) return out;
    for (const l of lines) {
        const a = prevQuote.itemPrices ? prevQuote.itemPrices[l.id] : null;
        const b = nextQuote.itemPrices ? nextQuote.itemPrices[l.id] : null;
        if (Number.isInteger(a) && Number.isInteger(b) && a !== b) {
            out.push({ lineId: l.id, kind: 'item', text: `The price of ${l.product.title} has changed. The new price is shown.` });
        }
    }
    const prevOpt = selectedOption({ quote: prevQuote, selectedShippingId: group.selectedShippingId });
    const sameOpt = nextQuote.shippingOptions.find((o) => prevOpt && o.label === prevOpt.label);
    if (prevOpt && (!sameOpt || sameOpt.cents !== prevOpt.cents)) {
        out.push({ retailer: group.retailer, kind: 'shipping', text: `Shipping from ${group.retailerName} has changed. The new price is shown.` });
    }
    const prevTax = groupTax({ quote: prevQuote }, prevOpt);
    const nextTax = groupTax({ quote: nextQuote }, sameOpt || selectedOption({ quote: nextQuote }));
    if (prevTax != null && nextTax != null && prevTax !== nextTax) {
        out.push({ retailer: group.retailer, kind: 'tax', text: `Tax from ${group.retailerName} has changed. The new price is shown.` });
    }
    return out;
}

function wrapPrices(batch) {
    const lines = readyLines(batch).filter((l) => l.wrap && l.wrap.done);
    if (!lines.length) return {};
    const w = wrapBreakdown(lines, batch.gifteeZip);
    return w.ok ? w.perLine : {};
}

module.exports = { computeBill, selectedOption, groupTax, readyLines, linePriceCents, bundlesFor, changeMessages, ymdPlusOne, WRAP_STYLES, wrapPrices };
