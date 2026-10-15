/**
 * Paid "We buy it" orders for the shopper's wrrapd.com My orders page, in the same shape as
 * summarizeOrderForWpList() in server.js. Matched on the gifter email used at payment.
 */
const store = require('./store');
const retailers = require('./retailers');

const dollars = (cents) => Math.round(Number(cents || 0)) / 100;

function https(url) {
    return typeof url === 'string' && /^https?:\/\//.test(url) ? url : null;
}

function ymdPlusOne(ymd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return null;
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function giftLine({ productId, title, variant, imageUrl, wrap, arrivalDate, giftee }) {
    const w = wrap || {};
    const design = w.aiDesign || w.upload || null;
    const designLabel = w.style === 'ai' && w.aiDesign
        ? `AI: ${String(w.aiDesign.title || 'AI-generated wrap').slice(0, 80)}`
        : w.style === 'upload' && w.upload
            ? `Upload: ${w.upload.fileName || 'your design'}`
            : 'Wrrapd: wrrapd';
    const gm = String(w.giftMessage || '').trim();
    return {
        productId: productId ? String(productId).slice(0, 48) : null,
        asin: null,
        productTitle: `${title}${variant ? ` (${variant})` : ''}`.slice(0, 200),
        productImageUrl: https(imageUrl),
        occasion: w.occasion || null,
        designSummary: designLabel,
        designLabel,
        designPreviewUrl: design ? https(design.imageUrl) : null,
        flowers: !!w.flowers,
        flowerOption: w.flowers ? 'Flowers' : null,
        deliveryHint: ymdPlusOne(arrivalDate),
        gifteeName: (giftee && giftee.name) || null,
        giftMessageSnippet: gm ? gm.slice(0, 160) + (gm.length > 160 ? '…' : '') : null,
        giftMessage: gm,
    };
}

function summarize(b) {
    const p = b.payment;
    const bill = b.paidBill;
    const lines = [];
    const invoice = [];
    for (const g of bill.groups) {
        const placed = b.placements && b.placements[g.retailer];
        for (const it of g.items) {
            const l = b.lines.find((x) => x.id === it.lineId) || {};
            if (l.cancelled) continue;
            lines.push(giftLine({
                productId: l.productId,
                title: it.title,
                variant: it.variant,
                imageUrl: it.imageUrl,
                wrap: l.wrap,
                arrivalDate: (placed && placed.arrivalDate) || g.shipping.arrivalDate,
                giftee: p.giftee,
            }));
        }
        invoice.push({ label: `${g.retailerName} items`, amount: dollars(g.items.reduce((s, i) => s + i.cents, 0)) });
        invoice.push({ label: `${g.retailerName} shipping`, amount: dollars(g.shipping.cents) });
        invoice.push({ label: `${g.retailerName} tax`, amount: dollars(g.taxCents) });
    }
    const w = bill.wrap;
    invoice.push({ label: 'Gift wrap', amount: dollars(w.giftWrapCents) });
    if (w.discountCents) invoice.push({ label: 'Multi-item discount', amount: -dollars(w.discountCents) });
    if (w.designAiCents || w.designUploadCents) invoice.push({ label: 'Custom design', amount: dollars(w.designAiCents + w.designUploadCents) });
    if (w.flowersCents) invoice.push({ label: 'Flowers add-on', amount: dollars(w.flowersCents) });
    if (w.boxCents) invoice.push({ label: 'Gift box', amount: dollars(w.boxCents) });
    invoice.push({ label: 'Tax on gift-wrap', amount: dollars(w.serviceTaxCents) });
    let paidCents = p.amountCents || bill.totalCents;
    const names = new Set(bill.groups.map((g) => g.retailerName));
    for (const a of b.addOns || []) {
        if (!a.payment) continue;
        paidCents += a.payment.amountCents || a.totalCents;
        names.add(a.retailerName);
        lines.push(giftLine({
            title: a.item.title,
            variant: a.item.variant,
            imageUrl: a.item.imageUrl,
            wrap: a.wrap,
            arrivalDate: (a.placement && a.placement.arrivalDate) || a.shipping.arrivalDate,
            giftee: p.giftee,
        }));
        invoice.push({ label: `Added item: ${a.item.title}`.slice(0, 120), amount: dollars(a.totalCents) });
    }
    const refunded = (b.refunds || []).filter((r) => r.ok).reduce((s, r) => s + r.amountCents, 0);
    if (refunded) invoice.push({ label: 'Refunded', amount: -dollars(refunded) });
    return {
        orderNumber: b.id,
        timestamp: p.paidAt || b.createdAt,
        retailer: [...names].filter(Boolean).join(', ') || (retailers.byId(bill.groups[0] && bill.groups[0].retailer) || {}).name || '',
        payment: { amount: paidCents - refunded, status: 'succeeded', id: p.transactionId || null },
        customerEmailNorm: p.emailNorm || null,
        wrrapdCustomerId: p.wrrapdCustomerId || null,
        claimedWpUserId: null,
        claimedAt: null,
        lineItemCount: lines.length,
        wrrapdLineCount: lines.length,
        lines,
        invoiceLines: [],
        checkoutInvoice: { lines: invoice },
        checkoutInvoiceComplete: null,
        source: 'buy-for-you',
    };
}

/** @returns {object[]} newest first */
function forEmail(emailNorm, batches) {
    if (!emailNorm) return [];
    const rows = (batches || store.list({ limit: 2000 })).filter(
        (b) => b && b.payment && b.paidBill && (b.status === 'paid' || b.status === 'closed') && b.payment.emailNorm === emailNorm,
    );
    return rows.map(summarize).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}

module.exports = { forEmail, summarize };
