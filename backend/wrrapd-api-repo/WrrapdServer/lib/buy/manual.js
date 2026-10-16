/**
 * "Add it manually": the shopper asks Wrrapd to add an item whose page we could not read.
 * Open order: the admin's facts put the item in the cart. Paid order: a separate add-on the
 * shopper approves and pays on pay.wrrapd.com/buy/approve.
 *
 * line.manual.state: requested → in_cart (open order) | awaiting_approval → paid → placed (paid order)
 *                    or declined / cancelled.
 */
const billing = require('./billing');
const standardShipping = require('./standard-shipping');
const salesTax = require('../sales-tax-zip');
const suppliedProduct = require('./supplied-product');
const lineFacts = require('./line-facts');
const retailers = require('./retailers');

const ADMIN_EMAIL = 'admin@wrrapd.com';

const READ_FAILURE_RE = /^(timeout|read_timeout|quote_timeout|blocked|no_title|too_many_redirects|redirect_without_location|http_\d+|zenrows_|fetch_failed|grok_|read_error)/;

function readFailed(line) {
    if (!line || line.removed || line.state !== 'unavailable') return false;
    if (!retailers.byId(line.retailer)) return false;
    return READ_FAILURE_RE.test(String(line.reason || ''));
}

function canAsk(line) {
    return readFailed(line) && !line.manual;
}

/** What the shopper page shows for this line: '', 'available', or the request state. */
function shopperState(line) {
    if (line.manual) return line.manual.state;
    return canAsk(line) ? 'available' : '';
}

function otherActive(batch, lineId) {
    return (batch.lines || []).filter((l) => l.id !== lineId && !l.removed && l.state !== 'unavailable').length;
}

function hubPercent(batch) {
    const zip = batch.hub && (batch.hub.postalCode || batch.hub.zip);
    const percent = salesTax.getCombinedRateAsTaxPercent(zip);
    return percent == null ? 7.5 : percent;
}

/** The gift-wrap the shopper chose for the rest of the order, without flowers. */
function wrapFromOrder(batch) {
    const paidIds = new Set(((batch.paidBill && batch.paidBill.groups) || []).flatMap((g) => g.items.map((i) => i.lineId)));
    const src = (batch.lines || []).find((l) => paidIds.has(l.id) && l.wrap && l.wrap.done);
    const w = (src && src.wrap) || {};
    const style = billing.WRAP_STYLES.has(w.style) ? w.style : 'wrrapd';
    const out = { occasion: w.occasion || '', style, giftMessage: w.giftMessage || '', senderName: w.senderName || '', wrrapdHint: w.wrrapdHint || '', done: true };
    if (style === 'ai' && w.aiDesign) out.aiDesign = w.aiDesign;
    if (style === 'upload' && w.upload) out.upload = w.upload;
    if ((style === 'ai' && !out.aiDesign) || (style === 'upload' && !out.upload)) out.style = 'wrrapd';
    return out;
}

/** Prices a paid-order add-on from the admin's facts. All cents. */
function priceAddOn(batch, line, facts, cfg) {
    const built = suppliedProduct.build(facts);
    if (!built.ok) return built;
    const p = built.product;
    if (cfg && p.pagePriceCents > cfg.perItemCapCents) {
        return { ok: false, error: `This item is over the per-item limit ($${(cfg.perItemCapCents / 100).toFixed(2)}).` };
    }
    const qty = lineFacts.clampQty(facts.qty);
    const merch = p.pagePriceCents * qty;
    let ship = p.standardShip && p.standardShip.cents != null ? p.standardShip.cents : null;
    if (ship == null) ship = standardShipping.groupShipCents(line.retailer, merch, null);
    if (ship == null) return { ok: false, error: 'Enter the shipping cost (0 when free).' };
    const taxCents = Math.round(((merch + ship) * hubPercent(batch)) / 100);
    const wrap = wrapFromOrder(batch);
    const w = billing.wrapBreakdown([{ id: line.id, product: { title: p.title, category: p.category }, wrap }], batch.gifteeZip);
    if (!w.ok) return { ok: false, error: 'Gift-wrap could not be priced. Please try again.' };
    const r = retailers.byId(line.retailer);
    const retailerCents = merch + ship + taxCents;
    return {
        ok: true,
        product: p,
        addOn: {
            lineId: line.id,
            state: 'awaiting_approval',
            retailer: line.retailer,
            retailerName: r ? r.name : line.retailerName || line.retailer,
            item: {
                title: p.title,
                imageUrl: p.imageUrl || '',
                variant: built.variantLabel || '',
                brand: p.brand || '',
                category: p.category || '',
                productUrl: line.canonicalUrl || line.url || '',
                unitCents: p.pagePriceCents,
                qty,
                cents: merch,
            },
            shipping: { cents: ship, arrivalDate: (p.standardShip && p.standardShip.arrivalDate) || null },
            taxCents,
            wrap,
            wrapBill: {
                giftWrapCents: w.giftWrapCents,
                designCents: w.designAiCents + w.designUploadCents,
                serviceTaxCents: w.serviceTaxCents,
                totalCents: w.totalCents,
                wrapBaseCents: (w.perLine[line.id] || {}).wrapBaseCents || 0,
            },
            retailerCents,
            totalCents: retailerCents + w.totalCents,
        },
    };
}

function publicAddOn(a) {
    return {
        id: a.id,
        lineId: a.lineId,
        state: a.state,
        retailerName: a.retailerName,
        item: { title: a.item.title, imageUrl: a.item.imageUrl, variant: a.item.variant, unitCents: a.item.unitCents, qty: a.item.qty, cents: a.item.cents },
        shipping: a.shipping,
        taxCents: a.taxCents,
        wrapBill: a.wrapBill,
        wrapStyle: a.wrap ? a.wrap.style : 'wrrapd',
        totalCents: a.totalCents,
        paidAt: a.payment ? a.payment.paidAt : null,
    };
}

/** The Command Center's view of one request, with the next step spelled out. */
function adminRow(batch, line, now = Date.now(), ttlMs = 24 * 60 * 60 * 1000) {
    const m = line.manual || {};
    const addOn = (batch.addOns || []).find((a) => a.lineId === line.id && a.state !== 'cancelled') || null;
    const p = batch.payment || null;
    const openSince = Math.max(Date.parse(batch.createdAt) || 0, Date.parse(batch.reopenedAt || '') || 0);
    const status = batch.status === 'open' && now - openSince > ttlMs ? 'expired' : batch.status;
    let state = m.state;
    if (state === 'in_cart' && batch.status !== 'open') {
        const paidIt = ((batch.paidBill && batch.paidBill.groups) || []).some((g) => g.items.some((i) => i.lineId === line.id));
        const placed = batch.placements && batch.placements[line.retailer] && batch.placements[line.retailer].state === 'placed';
        state = paidIt ? (placed ? 'placed' : 'paid_with_order') : 'in_cart';
    }
    if (line.removed && (state === 'requested' || state === 'in_cart')) state = 'removed';
    const r = retailers.byId(line.retailer);
    return {
        batchId: batch.id,
        lineId: line.id,
        url: line.url,
        retailer: line.retailer,
        retailerName: r ? r.name : line.retailerName || line.retailer,
        reason: line.reason || '',
        state,
        requestedAt: m.requestedAt || null,
        addedAt: m.addedAt || null,
        addedBy: m.addedBy || '',
        onlyItem: !!m.onlyItem,
        email: m.email || (p && p.email) || (batch.terms && batch.terms.email) || '',
        gifterName: p ? p.gifterName : '',
        batchStatus: status,
        gifteeZip: batch.gifteeZip,
        hub: batch.hub ? batch.hub.displayName : '',
        otherItems: otherActive(batch, line.id),
        product: line.product && line.manual && line.manual.state !== 'requested'
            ? { title: line.product.title, imageUrl: line.product.imageUrl || '', pagePriceCents: line.product.pagePriceCents || null, variant: line.variantLabel || '' }
            : null,
        addOn: addOn
            ? { ...publicAddOn(addOn), placement: addOn.placement || null, ingest: addOn.ingest || null, approvalSentAt: addOn.approvalSentAt || null, declinedAt: addOn.declinedAt || null }
            : null,
        note: m.note || '',
    };
}

module.exports = {
    ADMIN_EMAIL,
    READ_FAILURE_RE,
    readFailed,
    canAsk,
    shopperState,
    otherActive,
    wrapFromOrder,
    priceAddOn,
    publicAddOn,
    adminRow,
};
