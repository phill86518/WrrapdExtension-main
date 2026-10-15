/** Receipt for the shopper and short alerts for the team. Shopper copy stays short and plain. */

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const usd = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;

function fmtDate(ymd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return '';
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function row(label, value, strong) {
    const w = strong ? 'font-weight:700;' : '';
    return `<tr><td style="padding:6px 0;color:#162a52;${w}">${esc(label)}</td><td style="padding:6px 0;text-align:right;color:#0f0351;${w}">${esc(value)}</td></tr>`;
}

function receiptHtml({ batch, bill }) {
    const p = batch.payment || {};
    const rows = [];
    for (const g of bill.groups) {
        for (const it of g.items) rows.push(row(`${it.title}${it.variant ? ` (${it.variant})` : ''}`, usd(it.cents)));
        rows.push(row(`${g.retailerName} shipping: ${g.shipping.label}`, usd(g.shipping.cents)));
        rows.push(row(`${g.retailerName} tax`, usd(g.taxCents)));
    }
    const w = bill.wrap;
    rows.push(row(`Gift-wrap (${w.giftWrapCount || bill.groups.reduce((s, g) => s + g.items.length, 0)})`, usd(w.giftWrapCents)));
    if (w.discountCents) rows.push(row('Multi-item discount', `-${usd(w.discountCents)}`));
    if (w.designAiCents) rows.push(row('AI design', usd(w.designAiCents)));
    if (w.designUploadCents) rows.push(row('Your design', usd(w.designUploadCents)));
    if (w.flowersCents) rows.push(row('Flowers', usd(w.flowersCents)));
    if (w.boxCents) rows.push(row('Gift box', usd(w.boxCents)));
    rows.push(row('Tax on gift-wrap', usd(w.serviceTaxCents)));
    rows.push(row('Total paid', usd(bill.totalCents), true));
    const deliveries = bill.bundles
        .map((b) => {
            const when = b.deliveryDate ? `Estimated delivery ${fmtDate(b.deliveryDate)}` : 'Delivery date to follow';
            return `<li style="margin:4px 0">${esc(when)}: ${esc(b.titles.join(', '))}</li>`;
        })
        .join('');
    return `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:620px;margin:0 auto;padding:24px">
<div style="background:#0c0638;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0"><span style="font-size:22px;font-weight:700">Wrrapd</span></div>
<div style="background:#fff;padding:22px;border-radius:0 0 12px 12px">
<p style="color:#0f0351;font-size:18px;margin:0 0 8px">Thank you, ${esc(p.gifterFirstName || p.gifterName || '')}!</p>
<p style="color:#162a52;margin:0 0 14px">Your order is in. We are gift-wrapping your items and delivering them to ${esc(p.giftee && p.giftee.name)}.</p>
<p style="color:#162a52;margin:0 0 6px"><b>Order ${esc(batch.orderNumber)}</b></p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows.join('')}</table>
<p style="color:#162a52;margin:16px 0 4px"><b>Deliveries</b></p>
<ul style="color:#162a52;padding-left:18px;margin:0">${deliveries}</ul>
${(batch.lines || []).some((l) => !l.removed && l.manual && l.manual.state === 'requested') ? '<p style="color:#162a52;margin:14px 0 0">We are adding your other item by hand. We will email you to approve it.</p>' : ''}
<p style="color:#162a52;font-size:13px;margin:16px 0 0">Returns: 15 days after delivery, as described in the Terms you accepted (${esc(batch.terms && batch.terms.version)}). Questions? Call (844) 638-5484.</p>
</div></div></body></html>`;
}

function teamAlertHtml({ title, batch, lines, link }) {
    const items = (lines || [])
        .map((l) => `<li>${esc(l.retailerName)}: ${esc((l.product && l.product.title) || l.url)}<br><a href="${esc(l.url)}">${esc(l.url)}</a></li>`)
        .join('');
    return `<div style="font-family:Arial,sans-serif;color:#162a52">
<h3 style="color:#0f0351;margin:0 0 8px">${esc(title)}</h3>
<p>Batch ${esc(batch.id)}${batch.orderNumber ? ` / order ${esc(batch.orderNumber)}` : ''}. Giftee ZIP ${esc(batch.gifteeZip)}, hub ${esc(batch.hub && batch.hub.displayName)} (${esc(batch.hub && batch.hub.postalCode)}).</p>
<ul>${items}</ul>
<p><a href="${esc(link)}">Open in Command Center</a></p></div>`;
}

function shell(inner) {
    return `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:620px;margin:0 auto;padding:24px">
<div style="background:#0c0638;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0"><span style="font-size:22px;font-weight:700">Wrrapd</span></div>
<div style="background:#fff;padding:22px;border-radius:0 0 12px 12px">${inner}
<p style="color:#162a52;font-size:13px;margin:18px 0 0">Questions? Call (844) 638-5484.</p>
</div></div></body></html>`;
}

function button(href, label) {
    return `<p style="margin:20px 0"><a href="${esc(href)}" style="display:inline-block;background:#f6b933;color:#0f0351;font-weight:700;text-decoration:none;padding:13px 22px;border-radius:10px">${esc(label)}</a></p>`;
}

function itemBlock(item) {
    const img = item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="" width="64" height="64" style="width:64px;height:64px;object-fit:contain;border-radius:8px;margin-right:12px;vertical-align:middle">` : '';
    const qty = item.qty > 1 ? ` &times; ${item.qty}` : '';
    return `<p style="color:#0f0351;margin:0 0 12px">${img}<b>${esc(item.title)}</b>${item.variant ? ` (${esc(item.variant)})` : ''}${qty}</p>`;
}

function addOnRows(a) {
    const rows = [row(`${a.retailerName} item`, usd(a.item.cents)), row('Shipping', a.shipping.cents ? usd(a.shipping.cents) : 'Free'), row(`${a.retailerName} tax`, usd(a.taxCents))];
    rows.push(row('Gift-wrap', usd(a.wrapBill.giftWrapCents)));
    if (a.wrapBill.designCents) rows.push(row('Custom design', usd(a.wrapBill.designCents)));
    rows.push(row('Tax on gift-wrap', usd(a.wrapBill.serviceTaxCents)));
    return rows;
}

/** To admin@wrrapd.com when a shopper clicks Yes on "Add it manually". */
function manualRequestHtml({ batch, line, email, onlyItem, link }) {
    return `<div style="font-family:Arial,sans-serif;color:#162a52">
<h3 style="color:#0f0351;margin:0 0 8px">Add it manually: ${esc(line.retailerName || line.retailer)} item</h3>
<p>Order <b>${esc(batch.id)}</b> (${esc(batch.status)}). Giftee ZIP ${esc(batch.gifteeZip)}, hub ${esc(batch.hub && batch.hub.displayName)}.</p>
<p>Item link: <a href="${esc(line.url)}">${esc(line.url)}</a></p>
<p>Why the read failed: ${esc(line.reason || 'unknown')}</p>
<p>${onlyItem ? 'This is the only item in the order.' : 'The shopper has other items and will finish paying for them.'}${email ? ` Shopper email: ${esc(email)}.` : ''}</p>
<p><a href="${esc(link)}">Open Manual additions in Command Center</a></p></div>`;
}

/** Open order: the item is now in the shopper's cart. */
function cartReadyHtml({ title, cartUrl }) {
    return shell(`<p style="color:#0f0351;font-size:18px;margin:0 0 8px">Your item is in your cart</p>
<p style="color:#162a52;margin:0 0 6px">We added <b>${esc(title)}</b> to your Wrrapd cart. Choose the gift-wrap and pay to finish your order.</p>
${button(cartUrl, 'Open my cart')}`);
}

/** Paid order: approve and pay for the item Wrrapd added. */
function addOnApprovalHtml({ batch, addOn, approveUrl }) {
    const p = batch.payment || {};
    return shell(`<p style="color:#0f0351;font-size:18px;margin:0 0 8px">Hi ${esc(p.gifterFirstName || p.gifterName || '')}, your item is ready</p>
<p style="color:#162a52;margin:0 0 14px">We added this item to order <b>${esc(batch.id)}</b>. It will be gift-wrapped and delivered to ${esc(p.giftee && p.giftee.name)}.</p>
${itemBlock(addOn.item)}
<table style="width:100%;border-collapse:collapse;font-size:14px">${addOnRows(addOn).join('')}${row('Total', usd(addOn.totalCents), true)}</table>
${button(approveUrl, `Approve and pay ${usd(addOn.totalCents)}`)}
<p style="color:#162a52;font-size:13px;margin:0">Don't want it? Open the link and choose No thanks.</p>`);
}

function addOnReceiptHtml({ batch, addOn }) {
    const p = batch.payment || {};
    return shell(`<p style="color:#0f0351;font-size:18px;margin:0 0 8px">Thank you, ${esc(p.gifterFirstName || p.gifterName || '')}!</p>
<p style="color:#162a52;margin:0 0 14px">This item is now part of order <b>${esc(batch.id)}</b>.</p>
${itemBlock(addOn.item)}
<table style="width:100%;border-collapse:collapse;font-size:14px">${addOnRows(addOn).join('')}${row('Total paid', usd(addOn.totalCents), true)}</table>`);
}

function manualCancelledHtml({ batchId, title }) {
    return shell(`<p style="color:#0f0351;font-size:18px;margin:0 0 8px">We're sorry</p>
<p style="color:#162a52;margin:0">We could not add ${title ? `<b>${esc(title)}</b>` : 'that item'} to order ${esc(batchId)}. You have not been charged for it.</p>`);
}

module.exports = {
    receiptHtml,
    teamAlertHtml,
    usd,
    manualRequestHtml,
    cartReadyHtml,
    addOnApprovalHtml,
    addOnReceiptHtml,
    manualCancelledHtml,
};
