import { formatInTimeZone } from "date-fns-tz";

const NY = "America/New_York";

const wrap = (inner: string) => `<!DOCTYPE html>
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

export function thankYouEmailHtml(input: {
  customerName: string;
  orderId: string;
  trackingUrl: string;
  recipientName: string;
  addressLine: string;
  scheduledEtLabel: string;
}): string {
  const inner = `
<tr><td style="background:linear-gradient(135deg,#1a3d2e 0%,#2d5a47 50%,#c9a227 100%);padding:28px 24px;text-align:center;">
  <div style="font-size:13px;letter-spacing:0.35em;text-transform:uppercase;color:rgba(255,255,255,0.85);">Wrrapd</div>
  <h1 style="margin:12px 0 0;font-size:26px;font-weight:600;color:#fff;line-height:1.2;">Thank you for your order</h1>
  <p style="margin:10px 0 0;font-size:15px;color:rgba(255,255,255,0.92);">Your gift is in caring hands.</p>
</td></tr>
<tr><td style="padding:28px 28px 8px;">
  <p style="margin:0;font-size:16px;color:#1a1a1a;">Hi ${escapeHtml(input.customerName)},</p>
  <p style="margin:14px 0 0;font-size:15px;line-height:1.55;color:#333;">
    We're honored to wrap and deliver for you. Here is a summary of your Wrrapd delivery.
  </p>
</td></tr>
<tr><td style="padding:8px 28px 24px;">
  <table role="presentation" width="100%" style="background:#faf8f4;border-radius:10px;border:1px solid #e8e4dc;">
    <tr><td style="padding:18px 20px;">
      <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:#6b6560;">Order</p>
      <p style="margin:0;font-size:18px;font-weight:600;color:#1a3d2e;">${escapeHtml(input.orderId)}</p>
      <p style="margin:16px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:#6b6560;">Recipient</p>
      <p style="margin:0;font-size:15px;color:#222;">${escapeHtml(input.recipientName)}</p>
      <p style="margin:6px 0 0;font-size:14px;color:#555;line-height:1.45;">${escapeHtml(input.addressLine)}</p>
      <p style="margin:16px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:#6b6560;">Wrrapd delivery (Eastern)</p>
      <p style="margin:0;font-size:15px;color:#222;">${escapeHtml(input.scheduledEtLabel)}</p>
      <p style="margin:20px 0 0;">
        <a href="${escapeAttr(input.trackingUrl)}" style="display:inline-block;background:#1a3d2e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600;">Track your delivery</a>
      </p>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 28px 28px;font-size:13px;color:#777;line-height:1.5;">
  With gratitude,<br/><span style="color:#1a3d2e;font-weight:600;">Team Wrrapd</span>
</td></tr>`;
  return wrap(inner);
}

export function deliveryChoiceEmailHtml(input: {
  customerName: string;
  orderId: string;
  datesList: string;
  deadlineEtLabel: string;
  choiceUrl: string;
}): string {
  const inner = `
<tr><td style="background:linear-gradient(135deg,#1a3d2e,#4a3728);padding:26px 24px;text-align:center;">
  <h1 style="margin:0;font-size:22px;font-weight:600;color:#fff;">Choose how we schedule your Wrrapd delivery</h1>
</td></tr>
<tr><td style="padding:26px 28px;">
  <p style="margin:0;font-size:16px;color:#1a1a1a;">Hi ${escapeHtml(input.customerName)},</p>
  <p style="margin:14px 0 0;font-size:15px;line-height:1.55;color:#333;">
    Your Amazon gift-wrap items show <strong>different arrival dates</strong> (${escapeHtml(input.datesList)}).
    Your Wrrapd visit is currently planned <strong>after the last Amazon arrival</strong> (one combined trip).
  </p>
  <p style="margin:14px 0 0;font-size:15px;line-height:1.55;color:#333;">
    If you prefer we come <strong>as soon as possible after the first Amazon shipment</strong> instead, tell us before
    <strong>${escapeHtml(input.deadlineEtLabel)}</strong> (end of today, Eastern time).
  </p>
  <p style="margin:22px 0 0;text-align:center;">
    <a href="${escapeAttr(input.choiceUrl)}" style="display:inline-block;background:#c9a227;color:#1a1a1a;text-decoration:none;padding:14px 26px;border-radius:8px;font-size:15px;font-weight:700;">Open your choice page</a>
  </p>
  <p style="margin:18px 0 0;font-size:13px;color:#666;">Order ${escapeHtml(input.orderId)} — if we do not hear from you by the deadline, we will keep the <strong>combined</strong> schedule.</p>
</td></tr>`;
  return wrap(inner);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

export function formatOrderScheduleEt(scheduledForIso: string): string {
  const d = new Date(scheduledForIso);
  const day = formatInTimeZone(d, NY, "EEEE, MMMM d, yyyy");
  return `${day} · 1:00–7:00 PM Eastern window`;
}

/** Internal / operations — matches legacy Mailgun-style detail for admin@wrrapd.com. */
export function adminNewOrderEmailHtml(input: {
  orderId: string;
  externalOrderId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  recipientName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  scheduledEtLabel: string;
  trackingUrl: string;
  sourceNote?: string;
  deliveryPreferencePending?: boolean;
  amazonDeliveryDatesSnapshot?: string[];
}): string {
  const addr2 = input.addressLine2 ? `${escapeHtml(input.addressLine2)}, ` : "";
  const inner = `
<tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:24px;text-align:center;">
  <div style="font-size:12px;letter-spacing:0.25em;text-transform:uppercase;color:rgba(255,255,255,0.75);">Wrrapd Ops</div>
  <h1 style="margin:10px 0 0;font-size:22px;font-weight:600;color:#fff;">New order (tracking)</h1>
</td></tr>
<tr><td style="padding:24px 28px;">
  <table role="presentation" width="100%" style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
    <tr><td style="padding:18px 20px;">
      <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;">Order ID</p>
      <p style="margin:0;font-size:17px;font-weight:700;color:#0f172a;">${escapeHtml(input.orderId)}</p>
      ${
        input.externalOrderId
          ? `<p style="margin:10px 0 0;font-size:13px;color:#475569;">External / Amazon ref: <strong>${escapeHtml(input.externalOrderId)}</strong></p>`
          : ""
      }
      <hr style="margin:16px 0;border:none;border-top:1px solid #e2e8f0;"/>
      <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;">Customer (gifter)</p>
      <p style="margin:0;font-size:15px;color:#0f172a;">${escapeHtml(input.customerName)}</p>
      <p style="margin:6px 0 0;font-size:14px;color:#334155;">${escapeHtml(input.customerPhone)}</p>
      ${
        input.customerEmail
          ? `<p style="margin:6px 0 0;font-size:14px;color:#334155;"><a href="mailto:${escapeAttr(input.customerEmail)}" style="color:#1d4ed8;">${escapeHtml(input.customerEmail)}</a></p>`
          : ""
      }
      <hr style="margin:16px 0;border:none;border-top:1px solid #e2e8f0;"/>
      <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;">Recipient / delivery</p>
      <p style="margin:0;font-size:15px;font-weight:600;color:#0f172a;">${escapeHtml(input.recipientName)}</p>
      <p style="margin:8px 0 0;font-size:14px;color:#334155;line-height:1.5;">
        ${escapeHtml(input.addressLine1)}<br/>
        ${addr2}${escapeHtml(input.city)}, ${escapeHtml(input.state)} ${escapeHtml(input.postalCode)}
      </p>
      <hr style="margin:16px 0;border:none;border-top:1px solid #e2e8f0;"/>
      <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;">Wrrapd window (Eastern)</p>
      <p style="margin:0;font-size:15px;color:#0f172a;">${escapeHtml(input.scheduledEtLabel)}</p>
      ${
        input.deliveryPreferencePending && input.amazonDeliveryDatesSnapshot?.length
          ? `<p style="margin:12px 0 0;font-size:13px;color:#b45309;background:#fffbeb;padding:10px;border-radius:8px;border:1px solid #fcd34d;">
              <strong>Delivery choice pending</strong> — Amazon dates: ${escapeHtml(input.amazonDeliveryDatesSnapshot.join(", "))}
            </p>`
          : ""
      }
      ${
        input.sourceNote
          ? `<p style="margin:12px 0 0;font-size:13px;color:#475569;"><strong>Note:</strong> ${escapeHtml(input.sourceNote)}</p>`
          : ""
      }
      <p style="margin:18px 0 0;">
        <a href="${escapeAttr(input.trackingUrl)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600;">Open in tracking app</a>
      </p>
    </td></tr>
  </table>
</td></tr>`;
  return wrap(inner);
}
