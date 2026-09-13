/**
 * Branded checkout emails used when tracking ingest does not send notifications.
 * Customer copy matches tracking-platform thankYouEmailHtml (subject + body).
 * Admin copy is the detailed ops card — never send to departed staff.
 */

const WRRAPD_LOGO_URL = 'https://pay.wrrapd.com/img/wrrapd-logo-1-small.png';

const DEPARTED_STAFF_EMAILS = new Set(['angel@wrrapd.com']);

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
}

function firstName(input) {
    const s = String(input || '').trim();
    if (!s) return 'there';
    const cleaned = s.replace(/[^A-Za-z\s'-]/g, ' ').trim();
    const token = cleaned.split(/\s+/).find(Boolean);
    if (!token) return 'there';
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function wrap(inner) {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;background:#f4f1ea;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ea;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(26,61,46,0.12);">
${inner}
</table>
</td></tr></table>
</body></html>`;
}

function wrappingModeLabel(code) {
    const c = String(code || '').toLowerCase();
    if (c === 'wrrapd') return 'Wrrapd selects wrapping';
    if (c === 'upload') return 'Your uploaded design';
    if (c === 'ai') return 'AI-generated design';
    return code ? escapeHtml(code) : '—';
}

function wrappingModeOpsLabel(code) {
    const c = String(code || '').toLowerCase();
    if (c === 'wrrapd') return 'Wrrapd selects wrapping';
    if (c === 'upload') return 'Uploaded design';
    if (c === 'ai') return 'AI-generated design';
    return code ? escapeHtml(code) : '—';
}

function formatUsdFromCents(cents) {
    if (cents == null || !Number.isFinite(Number(cents))) return '';
    return `$${(Number(cents) / 100).toFixed(2)}`;
}

function formatRetailerDeliveryPlusOne(ymd) {
    if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
    const [y, m, d] = ymd.split('-').map(Number);
    const plusOne = new Date(Date.UTC(y, m - 1, d + 1, 16, 0, 0));
    if (Number.isNaN(plusOne.getTime())) return null;
    return plusOne.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/New_York',
    });
}

function deliveryWindowLabel(retailer, retailerYmd) {
    const plusOne = formatRetailerDeliveryPlusOne(retailerYmd);
    if (plusOne) return `${plusOne} (estimated)`;
    const name = retailer || 'Retailer';
    return `${name}'s estimated delivery date + 1 day`;
}

function thankYouGiftSummaryLine(li) {
    const bits = [wrappingModeLabel(li.wrappingOption)];
    if (li.flowers) bits.push('Flowers');
    return `<p style="margin:6px 0 0;font-size:12px;color:#555;line-height:1.4;">${bits.join(' · ')}</p>`;
}

function thankYouEmailHtml(input) {
    const greeting = firstName(input.customerGreetingName || input.customerName);
    const wrappedRows = (input.lineItems || [])
        .map((li) => {
            const title = escapeHtml(li.title || 'Wrapped item');
            const asin = li.asin
                ? `<p style="margin:6px 0 0;font-size:12px;color:#666;">ASIN: ${escapeHtml(li.asin)}</p>`
                : '';
            const gift = thankYouGiftSummaryLine(li);
            const img = li.imageUrl
                ? `<img src="${escapeAttr(li.imageUrl)}" alt="${title}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid #ddd;display:block;"/>`
                : `<div style="width:64px;height:64px;border-radius:8px;border:1px solid #ddd;background:#f6f6f6;"></div>`;
            return `<tr><td style="padding:10px 0;border-top:1px solid #ece8df;">
        <table role="presentation" width="100%"><tr>
          <td width="74" valign="top">${img}</td>
          <td valign="top">
            <p style="margin:0;font-size:14px;color:#222;font-weight:600;">${title}</p>
            ${asin}
            ${gift}
          </td>
        </tr></table>
      </td></tr>`;
        })
        .join('');
    const inner = `
<tr><td style="background:linear-gradient(135deg,#1a3d2e 0%,#2d5a47 50%,#c9a227 100%);padding:28px 24px;text-align:center;">
  <img src="${escapeAttr(WRRAPD_LOGO_URL)}" alt="Wrrapd" style="display:block;margin:0 auto 6px;max-width:170px;height:auto;"/>
  <h1 style="margin:12px 0 0;font-size:26px;font-weight:600;color:#fff;line-height:1.2;">Thank you for your order</h1>
  <p style="margin:10px 0 0;font-size:15px;color:rgba(255,255,255,0.92);">Your gift is in caring hands.</p>
</td></tr>
<tr><td style="padding:28px 28px 8px;">
  <p style="margin:0;font-size:16px;color:#1a1a1a;">Hi ${escapeHtml(greeting)},</p>
  <p style="margin:14px 0 0;font-size:15px;line-height:1.55;color:#333;">
    We're honored to gift-wrap for you. Here is a summary of your Wrrapd delivery.
  </p>
</td></tr>
<tr><td style="padding:8px 28px 24px;">
  <table role="presentation" width="100%" style="background:#faf8f4;border-radius:10px;border:1px solid #e8e4dc;">
    <tr><td style="padding:18px 20px;">
      <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:#6b6560;">Order</p>
      <p style="margin:0;font-size:18px;font-weight:600;color:#1a3d2e;">${escapeHtml(input.orderId)}</p>
      <p style="margin:16px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:#6b6560;">Recipient</p>
      <p style="margin:0;font-size:15px;color:#222;">${escapeHtml(input.recipientName || '—')}</p>
      <p style="margin:6px 0 0;font-size:14px;color:#555;line-height:1.45;">${escapeHtml(input.addressLine || '')}</p>
      <p style="margin:16px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:#6b6560;">Wrrapd delivery</p>
      <p style="margin:0;font-size:15px;color:#222;">${escapeHtml(input.scheduledEtLabel || '')}</p>
      ${
          wrappedRows
              ? `<p style="margin:16px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:#6b6560;">Items for gift-wrapping</p>
      <table role="presentation" width="100%">${wrappedRows}</table>`
              : ''
      }
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 28px 28px;font-size:13px;color:#777;line-height:1.5;">
  With gratitude,<br/><span style="color:#1a3d2e;font-weight:600;">Team Wrrapd</span>
</td></tr>`;
    return wrap(inner);
}

function lineItemOpsGiftBlock(li) {
    const parts = [];
    const flowerBit = li.flowers
        ? ` · Flowers yes${li.flowerDesign ? ` (${escapeHtml(li.flowerDesign)})` : ''}`
        : ' · Flowers no';
    parts.push(
        `<p style="margin:0;font-size:12px;color:#0f172a;line-height:1.4;"><strong>Mode</strong> ${wrappingModeOpsLabel(li.wrappingOption)}${flowerBit}</p>`,
    );
    if (String(li.wrappingOption || '').toLowerCase() === 'upload' && li.uploadedDesignFileName) {
        parts.push(
            `<p style="margin:3px 0 0;font-size:12px;color:#0f172a;"><strong>Upload</strong> ${escapeHtml(li.uploadedDesignFileName)}</p>`,
        );
    }
    if (String(li.wrappingOption || '').toLowerCase() === 'ai') {
        if (li.aiDesignTitle) {
            parts.push(
                `<p style="margin:3px 0 0;font-size:12px;color:#0f172a;"><strong>AI</strong> ${escapeHtml(li.aiDesignTitle)}</p>`,
            );
        }
        if (li.aiDesignDescription) {
            parts.push(
                `<p style="margin:2px 0 0;font-size:11px;color:#475569;line-height:1.35;">${escapeHtml(li.aiDesignDescription)}</p>`,
            );
        }
    }
    if (li.occasion) {
        parts.push(
            `<p style="margin:3px 0 0;font-size:12px;color:#0f172a;"><strong>Occasion</strong> ${escapeHtml(li.occasion)}</p>`,
        );
    }
    if (li.giftMessage) {
        parts.push(
            `<p style="margin:3px 0 0;font-size:12px;color:#0f172a;"><strong>Message</strong> ${escapeHtml(li.giftMessage)}</p>`,
        );
    }
    if (li.senderName) {
        parts.push(
            `<p style="margin:2px 0 0;font-size:12px;color:#0f172a;"><strong>Sender</strong> ${escapeHtml(li.senderName)}</p>`,
        );
    }
    return parts.join('');
}

function adminNewOrderEmailHtml(input) {
    const addr2 = input.addressLine2 ? `${escapeHtml(input.addressLine2)}, ` : '';
    const amountPaid = input.amountPaidLabel || formatUsdFromCents(input.orderValueCents);
    const wrapRev = formatUsdFromCents(input.wrapRevenueCents);
    const flowerRev = formatUsdFromCents(input.flowersRevenueCents);
    const moneyBits = [
        amountPaid ? `Charged ${amountPaid}` : '',
        wrapRev ? `Wrap ${wrapRev}` : '',
        flowerRev ? `Flowers ${flowerRev}` : '',
    ].filter(Boolean);
    const contactCell = [
        escapeHtml(input.customerPhone || ''),
        input.customerEmail
            ? `<a href="mailto:${escapeAttr(input.customerEmail)}" style="color:#1d4ed8;">${escapeHtml(input.customerEmail)}</a>`
            : '',
    ]
        .filter(Boolean)
        .join(' · ');
    const wrappedRows = (input.lineItems || [])
        .map((li, idx) => {
            const title = escapeHtml(li.title || 'Wrapped item');
            const asin = li.asin ? `ASIN ${escapeHtml(li.asin)}` : '';
            const img = li.imageUrl
                ? `<img src="${escapeAttr(li.imageUrl)}" alt="" style="width:56px;height:56px;object-fit:cover;border:1px solid #cbd5e1;border-radius:6px;vertical-align:middle;"/>`
                : `<div style="width:56px;height:56px;border-radius:6px;background:#f1f5f9;border:1px solid #e2e8f0;"></div>`;
            return `<table role="presentation" width="100%" style="margin:8px 0 0;border:1px solid #e2e8f0;border-radius:8px;background:#fff;"><tr><td style="padding:8px 10px;">
        <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Item ${idx + 1}</p>
        <table role="presentation" width="100%"><tr>
          <td width="64" valign="top" style="padding:0 8px 0 0;">${img}</td>
          <td valign="top" style="padding:0;">
            <p style="margin:0;font-size:13px;font-weight:600;color:#0f172a;line-height:1.35;">${title}${asin ? ` <span style="font-weight:500;color:#475569;">· ${asin}</span>` : ''}</p>
            <div style="margin:6px 0 0;padding:6px 8px;background:#f1f5f9;border-radius:6px;border:1px solid #e2e8f0;">${lineItemOpsGiftBlock(li)}</div>
          </td>
        </tr></table>
      </td></tr></table>`;
        })
        .join('');
    const inner = `
<tr><td style="background:#1a1a2e;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,0.08);">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
    <td valign="middle" style="padding:0;">
      <img src="${escapeAttr(WRRAPD_LOGO_URL)}" alt="Wrrapd" style="height:26px;width:auto;display:block;max-width:140px;"/>
    </td>
    <td valign="middle" align="right" style="padding:0 0 0 8px;">
      <span style="font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.65);white-space:nowrap;">Ops</span>
    </td>
  </tr></table>
  <p style="margin:4px 0 0;font-size:12px;font-weight:600;color:rgba(255,255,255,0.95);line-height:1.3;">${escapeHtml(input.publicOrderRef)} · new order · ops alert</p>
</td></tr>
<tr><td style="padding:12px 14px 16px;">
  <table role="presentation" width="100%" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
    <tr><td style="padding:10px 12px;">
      <table role="presentation" width="100%" style="font-size:13px;line-height:1.35;color:#0f172a;">
        ${
            input.retailer
                ? `<tr>
          <td style="padding:6px 8px 2px 0;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;vertical-align:top;">Retailer</td>
          <td style="padding:6px 0 2px;font-weight:600;">${escapeHtml(input.retailer)}</td>
        </tr>
        <tr><td colspan="2" style="padding:4px 0 4px;border-bottom:1px solid #e2e8f0;"></td></tr>`
                : ''
        }
        ${
            moneyBits.length
                ? `<tr>
          <td style="padding:6px 8px 2px 0;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;vertical-align:top;">Payment</td>
          <td style="padding:6px 0 2px;">${escapeHtml(moneyBits.join(' · '))}</td>
        </tr>
        <tr><td colspan="2" style="padding:4px 0 4px;border-bottom:1px solid #e2e8f0;"></td></tr>`
                : ''
        }
        <tr>
          <td style="padding:6px 8px 2px 0;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;vertical-align:top;">Customer (gifter)</td>
          <td style="padding:6px 0 2px;">
            <span style="font-weight:600;">${escapeHtml(input.customerName || '—')}</span><br/>
            <span style="font-size:12px;color:#334155;">${contactCell}</span>
          </td>
        </tr>
        <tr><td colspan="2" style="padding:4px 0 4px;border-bottom:1px solid #e2e8f0;"></td></tr>
        <tr>
          <td style="padding:6px 8px 2px 0;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;vertical-align:top;">Deliver to</td>
          <td style="padding:6px 0 2px;">
            <span style="font-weight:600;">${escapeHtml(input.recipientName || '—')}</span><br/>
            <span style="font-size:12px;color:#334155;">${escapeHtml(input.addressLine1 || '')}${addr2 ? ` · ${addr2}` : ''}${
                input.city ? ` · ${escapeHtml(input.city)}, ${escapeHtml(input.state || '')} ${escapeHtml(input.postalCode || '')}` : ''
            }</span>
          </td>
        </tr>
        <tr><td colspan="2" style="padding:4px 0 4px;border-bottom:1px solid #e2e8f0;"></td></tr>
        <tr>
          <td style="padding:6px 8px 2px 0;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;vertical-align:top;">Window (ET)</td>
          <td style="padding:6px 0 2px;font-size:13px;">${escapeHtml(input.scheduledEtLabel || '')}</td>
        </tr>
        ${
            input.allocationNote
                ? `<tr><td colspan="2" style="padding:4px 0 4px;border-bottom:1px solid #e2e8f0;"></td></tr>
        <tr>
          <td style="padding:6px 8px 2px 0;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;vertical-align:top;">Allocation</td>
          <td style="padding:6px 0 2px;font-size:13px;">${escapeHtml(input.allocationNote)}</td>
        </tr>`
                : ''
        }
      </table>
      ${
          input.sourceNote
              ? `<p style="margin:8px 0 0;font-size:12px;color:#475569;line-height:1.35;"><strong>Note</strong> ${escapeHtml(input.sourceNote)}</p>`
              : ''
      }
      ${
          input.ingestFailedReason
              ? `<p style="margin:8px 0 0;font-size:12px;color:#9a3412;background:#fff7ed;padding:6px 8px;border-radius:6px;border:1px solid #fdba74;line-height:1.35;"><strong>Tracking ingest failed</strong> — ${escapeHtml(input.ingestFailedReason)}. Allocate in Command Center after the order is recovered.</p>`
              : ''
      }
      ${wrappedRows ? `<p style="margin:8px 0 4px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Gift-wrap items</p>${wrappedRows}` : ''}
    </td></tr>
  </table>
</td></tr>`;
    return wrap(inner);
}

function isDepartedStaffEmail(email) {
    return DEPARTED_STAFF_EMAILS.has(String(email || '').trim().toLowerCase());
}

function filterLiveRecipients(list) {
    const arr = Array.isArray(list)
        ? list
        : String(list || '')
              .split(/[;,]/)
              .map((s) => s.trim());
    const live = arr.filter((e) => e && !isDepartedStaffEmail(e));
    return live.length ? live : ['admin@wrrapd.com'];
}

function thankYouSubject(orderNumber) {
    return `Thank you — Wrrapd order ${orderNumber}`;
}

function adminNewOrderSubject(orderNumber) {
    return `New Wrrapd order ${orderNumber}`;
}

module.exports = {
    thankYouEmailHtml,
    adminNewOrderEmailHtml,
    thankYouSubject,
    adminNewOrderSubject,
    deliveryWindowLabel,
    firstName,
    filterLiveRecipients,
    isDepartedStaffEmail,
    DEPARTED_STAFF_EMAILS,
};
