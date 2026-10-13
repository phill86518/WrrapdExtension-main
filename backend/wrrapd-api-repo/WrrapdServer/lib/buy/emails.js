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
<p style="color:#162a52;margin:0 0 14px">We are buying your items, gift-wrapping them, and delivering them to ${esc(p.giftee && p.giftee.name)}.</p>
<p style="color:#162a52;margin:0 0 6px"><b>Order ${esc(batch.orderNumber)}</b></p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows.join('')}</table>
<p style="color:#162a52;margin:16px 0 4px"><b>Deliveries</b></p>
<ul style="color:#162a52;padding-left:18px;margin:0">${deliveries}</ul>
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

module.exports = { receiptHtml, teamAlertHtml, usd };
