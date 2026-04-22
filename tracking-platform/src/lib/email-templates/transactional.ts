import { formatInTimeZone } from "date-fns-tz";
import { toInstantDate } from "@/lib/ny-date";
import { wrrapdScheduledInstantIsoForUi } from "@/lib/order-schedule-display";
import type { OrderLineItem } from "@/lib/types";

const NY = "America/New_York";
const WRRAPD_LOGO_URL = "https://pay.wrrapd.com/img/wrrapd-logo-1-small.png";

function firstName(input: string): string {
  const s = (input || "").trim();
  if (!s) return "there";
  const cleaned = s.replace(/[^A-Za-z\s'-]/g, " ").trim();
  const token = cleaned.split(/\s+/).find(Boolean);
  if (!token) return "there";
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

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

function wrappingModeLabel(code: string | undefined): string {
  const c = (code || "").toLowerCase();
  if (c === "wrrapd") return "Wrrapd selects wrapping";
  if (c === "upload") return "Your uploaded design";
  if (c === "ai") return "AI-generated design";
  return code ? escapeHtml(code) : "—";
}

function thankYouGiftSummaryLine(li: OrderLineItem): string {
  const bits: string[] = [wrappingModeLabel(li.wrappingOption)];
  if (li.flowers) bits.push(li.flowerDesign ? `Flowers (${escapeHtml(li.flowerDesign)})` : "Flowers");
  if (!bits.length) return "";
  return `<p style="margin:6px 0 0;font-size:12px;color:#555;line-height:1.4;">${bits.join(" · ")}</p>`;
}

/** Compact ops lines for admin new-order email (one item card). */
function lineItemOpsGiftBlock(li: OrderLineItem): string {
  const parts: string[] = [];
  const flowerBit = li.flowers
    ? ` · Flowers yes${li.flowerDesign ? ` (${escapeHtml(li.flowerDesign)})` : ""}`
    : " · Flowers no";
  parts.push(
    `<p style="margin:0;font-size:12px;color:#0f172a;line-height:1.4;"><strong>Mode</strong> ${wrappingModeLabel(li.wrappingOption)}${flowerBit}</p>`,
  );
  if ((li.wrappingOption || "").toLowerCase() === "upload") {
    const fn = li.uploadedDesignFileName || (li.uploadedDesignPath ? li.uploadedDesignPath.split("/").pop() : "") || "";
    if (fn) {
      parts.push(
        `<p style="margin:3px 0 0;font-size:12px;color:#0f172a;"><strong>Upload</strong> ${escapeHtml(fn)}</p>`,
      );
    }
    if (li.uploadedDesignPath && li.uploadedDesignPath !== fn) {
      parts.push(
        `<p style="margin:2px 0 0;font-size:11px;color:#64748b;word-break:break-all;">${escapeHtml(li.uploadedDesignPath)}</p>`,
      );
    }
  }
  if ((li.wrappingOption || "").toLowerCase() === "ai") {
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
    parts.push(`<p style="margin:3px 0 0;font-size:12px;color:#0f172a;"><strong>Occasion</strong> ${escapeHtml(li.occasion)}</p>`);
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
  return parts.join("");
}

export function thankYouEmailHtml(input: {
  customerName: string;
  customerGreetingName?: string;
  orderId: string;
  trackingUrl: string;
  recipientName: string;
  addressLine: string;
  scheduledEtLabel: string;
  lineItems?: OrderLineItem[];
}): string {
  const wrappedRows = (input.lineItems || [])
    .map((li) => {
      const title = escapeHtml(li.title || "Wrapped item");
      const asin = li.asin ? `<p style="margin:6px 0 0;font-size:12px;color:#666;">ASIN: ${escapeHtml(li.asin)}</p>` : "";
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
    .join("");
  const inner = `
<tr><td style="background:linear-gradient(135deg,#1a3d2e 0%,#2d5a47 50%,#c9a227 100%);padding:28px 24px;text-align:center;">
  <img src="${escapeAttr(WRRAPD_LOGO_URL)}" alt="Wrrapd" style="display:block;margin:0 auto 6px;max-width:170px;height:auto;"/>
  <h1 style="margin:12px 0 0;font-size:26px;font-weight:600;color:#fff;line-height:1.2;">Thank you for your order</h1>
  <p style="margin:10px 0 0;font-size:15px;color:rgba(255,255,255,0.92);">Your gift is in caring hands.</p>
</td></tr>
<tr><td style="padding:28px 28px 8px;">
  <p style="margin:0;font-size:16px;color:#1a1a1a;">Hi ${escapeHtml(firstName(input.customerName))},</p>
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
      <p style="margin:0;font-size:15px;color:#222;">${escapeHtml(input.recipientName)}</p>
      <p style="margin:6px 0 0;font-size:14px;color:#555;line-height:1.45;">${escapeHtml(input.addressLine)}</p>
      <p style="margin:16px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:#6b6560;">Wrrapd delivery</p>
      <p style="margin:0;font-size:15px;color:#222;">${escapeHtml(input.scheduledEtLabel)}</p>
      ${
        wrappedRows
          ? `<p style="margin:16px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:#6b6560;">Items for gift-wrapping</p>
      <table role="presentation" width="100%">${wrappedRows}</table>`
          : ""
      }
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
  customerGreetingName?: string;
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
  <p style="margin:0;font-size:16px;color:#1a1a1a;">Hi ${escapeHtml(firstName(input.customerName))},</p>
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
  const d = toInstantDate(scheduledForIso);
  const day = Number.isNaN(d.getTime())
    ? scheduledForIso
    : formatInTimeZone(d, NY, "EEEE, MMMM d, yyyy");
  return `${day} · 1:00–7:00 PM ET`;
}

/**
 * Customer thank-you, admin alert, SMS — same Wrrapd **calendar** day as Command Center / tracking
 * when we can infer the Amazon anchor from `amazonDeliveryDatesSnapshot` (repairs legacy rows where
 * `scheduledFor` matched Amazon +0).
 */
export function formatWrrapdDeliveryWindowEtForNotifications(order: {
  scheduledFor: string;
  amazonDeliveryDatesSnapshot?: string[];
  deliveryPreferenceChoice?: string;
}): string {
  return formatOrderScheduleEt(wrrapdScheduledInstantIsoForUi(order));
}

/** Internal / operations — detailed admin notification layout. */
export function adminNewOrderEmailHtml(input: {
  /** Amazon-style id or "Manual — …" — never internal ord-* */
  publicOrderRef: string;
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
  lineItems?: OrderLineItem[];
}): string {
  const addr2 = input.addressLine2 ? `${escapeHtml(input.addressLine2)}, ` : "";
  const contactCell = [
    escapeHtml(input.customerPhone),
    input.customerEmail
      ? `<a href="mailto:${escapeAttr(input.customerEmail)}" style="color:#1d4ed8;">${escapeHtml(input.customerEmail)}</a>`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const wrappedRows = (input.lineItems || [])
    .map((li, idx) => {
      const title = escapeHtml(li.title || "Wrapped item");
      const asin = li.asin ? `ASIN ${escapeHtml(li.asin)}` : "";
      const img = li.imageUrl
        ? `<img src="${escapeAttr(li.imageUrl)}" alt="" style="width:56px;height:56px;object-fit:cover;border:1px solid #cbd5e1;border-radius:6px;vertical-align:middle;"/>`
        : "";
      const wrapOpt = (li.wrappingOption || "").toLowerCase();
      const hasDesign =
        (wrapOpt === "ai" || wrapOpt === "upload") &&
        !!(li.wrappingDesignImageUrl || li.wrappingDesignStoragePath);
      const designThumb = li.wrappingDesignImageUrl
        ? `<a href="${escapeAttr(li.wrappingDesignImageUrl)}" style="display:inline-block;line-height:0;" title="Open design image"
            ><img src="${escapeAttr(li.wrappingDesignImageUrl)}" alt="Wrapping design" style="width:56px;height:56px;object-fit:cover;border:1px solid #94a3b8;border-radius:6px;vertical-align:middle;"/></a>`
        : "";
      const printLines =
        li.wrappingDesignFileName || li.wrappingDesignStoragePath
          ? `<p style="margin:4px 0 0;font-size:11px;color:#334155;line-height:1.35;">
              <strong>Print file</strong> ${escapeHtml(li.wrappingDesignFileName || "—")}<br/>
              <span style="font-size:10px;color:#64748b;">Storage (GCS)</span> <code style="font-size:10px;word-break:break-all;">${escapeHtml(li.wrappingDesignStoragePath || "")}</code>
            </p>`
          : "";
      return `<table role="presentation" width="100%" style="margin:8px 0 0;border:1px solid #e2e8f0;border-radius:8px;background:#fff;"><tr><td style="padding:8px 10px;">
        <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Item ${idx + 1}</p>
        <table role="presentation" width="100%"><tr>
          <td width="64" valign="top" style="padding:0 8px 0 0;">${img || `<div style="width:56px;height:56px;border-radius:6px;background:#f1f5f9;border:1px solid #e2e8f0;"></div>`}</td>
          <td valign="top" style="padding:0;">
            <p style="margin:0;font-size:13px;font-weight:600;color:#0f172a;line-height:1.35;">${title}${asin ? ` <span style="font-weight:500;color:#475569;">· ${asin}</span>` : ""}</p>
            <div style="margin:6px 0 0;padding:6px 8px;background:#f1f5f9;border-radius:6px;border:1px solid #e2e8f0;">${lineItemOpsGiftBlock(li)}</div>
            ${
              hasDesign
                ? `<table role="presentation" width="100%" style="margin:8px 0 0;"><tr>
              <td width="64" valign="top" style="padding:0 8px 0 0;">${designThumb || `<div style="width:56px;height:56px;border-radius:6px;background:#e2e8f0;border:1px dashed #94a3b8;font-size:9px;color:#64748b;text-align:center;line-height:1.1;padding:4px;">No preview URL</div>`}</td>
              <td valign="top" style="padding:0;">
                <p style="margin:0;font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Gift-wrap design</p>
                ${li.wrappingDesignImageUrl ? `<p style="margin:4px 0 0;font-size:12px;"><a href="${escapeAttr(li.wrappingDesignImageUrl)}" style="color:#1d4ed8;">Open full-size (printer)</a></p>` : ""}
                ${printLines}
              </td>
            </tr></table>`
                : ""
            }
          </td>
        </tr></table>
      </td></tr></table>`;
    })
    .join("");
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
  <p style="margin:4px 0 0;font-size:12px;font-weight:600;color:rgba(255,255,255,0.95);line-height:1.3;">${escapeHtml(input.publicOrderRef)} · new order · tracking</p>
</td></tr>
<tr><td style="padding:12px 14px 16px;">
  <table role="presentation" width="100%" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
    <tr><td style="padding:10px 12px;">
      <table role="presentation" width="100%" style="font-size:13px;line-height:1.35;color:#0f172a;">
        <tr>
          <td style="padding:6px 8px 2px 0;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;vertical-align:top;">Customer (gifter)</td>
          <td style="padding:6px 0 2px;">
            <span style="font-weight:600;">${escapeHtml(input.customerName)}</span><br/>
            <span style="font-size:12px;color:#334155;">${contactCell}</span>
          </td>
        </tr>
        <tr><td colspan="2" style="padding:4px 0 4px;border-bottom:1px solid #e2e8f0;"></td></tr>
        <tr>
          <td style="padding:6px 8px 2px 0;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;vertical-align:top;">Deliver to</td>
          <td style="padding:6px 0 2px;">
            <span style="font-weight:600;">${escapeHtml(input.recipientName)}</span><br/>
            <span style="font-size:12px;color:#334155;">${escapeHtml(input.addressLine1)} · ${addr2}${escapeHtml(input.city)}, ${escapeHtml(input.state)} ${escapeHtml(input.postalCode)}</span>
          </td>
        </tr>
        <tr><td colspan="2" style="padding:4px 0 4px;border-bottom:1px solid #e2e8f0;"></td></tr>
        <tr>
          <td style="padding:6px 8px 2px 0;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;vertical-align:top;">Window (ET)</td>
          <td style="padding:6px 0 2px;font-size:13px;">${escapeHtml(input.scheduledEtLabel)}</td>
        </tr>
      </table>
      ${
        input.deliveryPreferencePending && input.amazonDeliveryDatesSnapshot?.length
          ? `<p style="margin:8px 0 0;font-size:12px;color:#b45309;background:#fffbeb;padding:6px 8px;border-radius:6px;border:1px solid #fcd34d;line-height:1.35;">
              <strong>Choice pending</strong> — Amazon arrival date(s): ${escapeHtml(input.amazonDeliveryDatesSnapshot.join(", "))}.
              Wrrapd’s default route is the <strong>next calendar day</strong> after the last of these (see window above).
            </p>`
          : ""
      }
      ${
        input.sourceNote
          ? `<p style="margin:6px 0 0;font-size:12px;color:#475569;line-height:1.35;"><strong>Note</strong> ${escapeHtml(input.sourceNote)}</p>`
          : ""
      }
      ${wrappedRows ? `<p style="margin:8px 0 4px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Gift-wrap items</p>${wrappedRows}` : ""}
      <p style="margin:10px 0 0;">
        <a href="${escapeAttr(input.trackingUrl)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;">Open in tracking app</a>
      </p>
    </td></tr>
  </table>
</td></tr>`;
  return wrap(inner);
}
