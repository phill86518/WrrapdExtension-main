import type { Order } from "@/lib/types";
import {
  getPublicOrigin,
  sendTransactionalEmail,
  sendTransactionalSms,
  smtpEnvConfigured,
  toUsE164,
} from "@/lib/customer-notify";
import {
  adminNewOrderEmailHtml,
  deliveryChoiceEmailHtml,
  formatWrrapdDeliveryWindowEtForNotifications,
  thankYouEmailHtml,
} from "@/lib/email-templates/transactional";
import { orderRecipientForDisplay } from "@/lib/order-display";
import { formatInTimeZone } from "date-fns-tz";

const NY = "America/New_York";

export type PostOrderNotifySummary = {
  skipped: boolean;
  skipReason?: string;
  mailgunEnvPresent: boolean;
  smtpEnvPresent: boolean;
  twilioEnvPresent: boolean;
  customerThankYouEmailSent: boolean;
  adminEmailsSent: number;
  customerSmsSent: boolean;
  /** Short line for API / extension UI */
  message: string;
};

/** Default inbox for new-order alerts and thank-you BCC — never the transactional From address (orders@). */
const OPS_INBOX_DEFAULT = "admin@wrrapd.com";

/**
 * Single recipient for new-order alerts and thank-you BCC.
 * NOTIFY_OPS_ADMIN_EMAIL may list multiple addresses; we use only one non-orders@ address so SMTP does not put orders@ in To.
 */
function opsInboxRecipient(): string {
  const raw = process.env.NOTIFY_OPS_ADMIN_EMAIL?.trim();
  if (!raw) return OPS_INBOX_DEFAULT;
  const parts = raw
    .split(/[;,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const notOrders = parts.find((a) => a !== "orders@wrrapd.com");
  return notOrders || OPS_INBOX_DEFAULT;
}

/** BCC on customer thank-you: same ops inbox only; skip if customer is already that address. */
function thankYouBccRecipient(customerEmail: string | undefined, opsInbox: string): string | undefined {
  const ce = customerEmail?.trim().toLowerCase();
  if (ce && ce === opsInbox.toLowerCase()) return undefined;
  return opsInbox;
}

function envFlags() {
  const smtpEnvPresent = smtpEnvConfigured();
  const mailgunEnvPresent = !!(
    process.env.MAILGUN_API_KEY?.trim() && process.env.MAILGUN_DOMAIN?.trim()
  );
  const twilioEnvPresent = !!(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
    process.env.TWILIO_AUTH_TOKEN?.trim() &&
    process.env.TWILIO_SMS_FROM?.trim()
  );
  return { smtpEnvPresent, mailgunEnvPresent, twilioEnvPresent };
}

export async function sendPostOrderNotifications(order: Order): Promise<PostOrderNotifySummary> {
  const { smtpEnvPresent, mailgunEnvPresent, twilioEnvPresent } = envFlags();
  const emailTransportPresent = smtpEnvPresent || mailgunEnvPresent;
  const base: PostOrderNotifySummary = {
    skipped: false,
    mailgunEnvPresent,
    smtpEnvPresent,
    twilioEnvPresent,
    customerThankYouEmailSent: false,
    adminEmailsSent: 0,
    customerSmsSent: false,
    message: "",
  };

  if (process.env.TRACKING_NOTIFY_NEW_ORDERS === "false") {
    console.info("[post-order-notify] skipped (TRACKING_NOTIFY_NEW_ORDERS=false)", order.id);
    return {
      ...base,
      skipped: true,
      skipReason: "TRACKING_NOTIFY_NEW_ORDERS=false",
      message: "Notifications disabled by TRACKING_NOTIFY_NEW_ORDERS=false",
    };
  }

  const opsInbox = opsInboxRecipient();
  console.info("[post-order-notify] start", order.id, {
    hasCustomerEmail: Boolean(order.customerEmail?.trim()),
    opsInbox,
  });

  const origin = getPublicOrigin();
  const trackingPath = `/track/${order.trackingToken}`;
  const trackingUrl = origin ? `${origin}${trackingPath}` : trackingPath;
  const deliver = orderRecipientForDisplay(order);
  const addressLine = `${deliver.addressLine1}, ${deliver.city}, ${deliver.state} ${deliver.postalCode}`;
  const scheduledEtLabel = formatWrrapdDeliveryWindowEtForNotifications({
    scheduledFor: order.scheduledFor,
    amazonDeliveryDatesSnapshot: order.amazonDeliveryDatesSnapshot,
    deliveryPreferenceChoice: order.deliveryPreferenceChoice,
  });
  /** Customer-facing reference only (no internal ord-*). */
  const customerVisibleRef =
    order.externalOrderId?.trim() || deliver.recipientName?.trim() || "your Wrrapd order";
  const adminPublicOrderRef =
    order.externalOrderId?.trim() ||
    (order.sourceNote?.match(/Amazon order (\S+)/)?.[1]?.trim() ?? "") ||
    `Manual — ${deliver.recipientName?.trim() || "Wrrapd"}`;

  const thankYouSubject = `Thank you — Wrrapd order ${customerVisibleRef}`;
  const thankYouHtml = thankYouEmailHtml({
    customerName: order.customerName,
    customerGreetingName: order.customerGreetingName,
    orderId: customerVisibleRef,
    trackingUrl,
    recipientName: deliver.recipientName,
    addressLine,
    scheduledEtLabel,
    lineItems: order.lineItems,
  });

  if (order.customerEmail?.trim()) {
    try {
      const bcc = thankYouBccRecipient(order.customerEmail.trim(), opsInbox);
      const ok = await sendTransactionalEmail({
        to: order.customerEmail.trim(),
        subject: thankYouSubject,
        html: thankYouHtml,
        ...(bcc ? { bcc } : {}),
      });
      base.customerThankYouEmailSent = ok;
      if (ok && bcc) {
        console.info("[post-order-notify] thank-you sent with ops BCC", order.id, { bcc });
      }
    } catch (e) {
      console.error("[post-order-notify] customer thank-you email failed", order.id, e);
    }
  }

  const adminHtml = adminNewOrderEmailHtml({
    publicOrderRef: adminPublicOrderRef,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    recipientName: deliver.recipientName,
    addressLine1: deliver.addressLine1,
    addressLine2: deliver.addressLine2,
    city: deliver.city,
    state: deliver.state,
    postalCode: deliver.postalCode,
    scheduledEtLabel,
    trackingUrl,
    sourceNote: order.sourceNote,
    deliveryPreferencePending: order.deliveryPreferencePending,
    amazonDeliveryDatesSnapshot: order.amazonDeliveryDatesSnapshot,
    lineItems: order.lineItems,
  });
  const adminSubject = order.externalOrderId?.trim()
    ? `New Wrrapd order ${order.externalOrderId.trim()}`
    : `New Wrrapd order — ${deliver.recipientName?.trim() || "received"}`;
  try {
    const ok = await sendTransactionalEmail({
      to: opsInbox,
      subject: adminSubject,
      html: adminHtml,
    });
    if (ok) base.adminEmailsSent = 1;
  } catch (e) {
    console.error("[post-order-notify] admin new-order email failed", order.id, e);
  }

  const e164 = toUsE164(order.customerPhone);
  if (e164) {
    const sms =
      `Wrrapd: Thanks for your order (${customerVisibleRef})! Track: ${trackingUrl} ` +
      `Delivery window ${scheduledEtLabel}.`;
    try {
      const ok = await sendTransactionalSms({ toE164: e164, body: sms.slice(0, 1500) });
      base.customerSmsSent = ok;
    } catch (e) {
      console.error("[post-order-notify] customer SMS failed", order.id, e);
    }
  }

  if (
    order.deliveryPreferencePending &&
    order.deliveryPreferenceToken &&
    order.amazonDeliveryDatesSnapshot &&
    order.amazonDeliveryDatesSnapshot.length > 1 &&
    (order.lineItems?.length ?? 0) > 1 &&
    Boolean(order.externalOrderId?.trim())
  ) {
    const choicePath = `/delivery-choice?t=${encodeURIComponent(order.deliveryPreferenceToken)}`;
    const choiceUrl = origin ? `${origin}${choicePath}` : choicePath;
    const deadline = order.deliveryPreferenceRespondBy
      ? formatInTimeZone(new Date(order.deliveryPreferenceRespondBy), NY, "EEEE, MMM d, yyyy · h:mm a 'Eastern'")
      : "end of today (Eastern)";

    if (order.customerEmail?.trim()) {
      try {
        await sendTransactionalEmail({
          to: order.customerEmail.trim(),
          subject: `Action needed: Wrrapd delivery schedule for order ${customerVisibleRef}`,
          html: deliveryChoiceEmailHtml({
            customerName: order.customerName,
            customerGreetingName: order.customerGreetingName,
            orderId: customerVisibleRef,
            datesList: order.amazonDeliveryDatesSnapshot.join(", "),
            deadlineEtLabel: deadline,
            choiceUrl,
          }),
        });
      } catch (e) {
        console.error("[post-order-notify] delivery-choice email failed", order.id, e);
      }
    }

    if (e164) {
      const m =
        `Wrrapd: Your Amazon items have different delivery dates (${order.amazonDeliveryDatesSnapshot.join(", ")}). ` +
        `We're planning one Wrrapd visit after the LAST Amazon date unless you choose faster: ${choiceUrl} ` +
        `Reply isn't supported — use the link by ${deadline}.`;
      try {
        await sendTransactionalSms({ toE164: e164, body: m.slice(0, 1500) });
      } catch (e) {
        console.error("[post-order-notify] delivery-choice SMS failed", order.id, e);
      }
    }
  }

  const parts: string[] = [];
  if (!emailTransportPresent) {
    parts.push("No email transport on Cloud Run (set SMTP_HOST, SMTP_USER, SMTP_PASS for SiteGround, or Mailgun vars as fallback)");
  } else if (order.customerEmail?.trim() && !base.customerThankYouEmailSent) {
    parts.push("Customer thank-you email not sent (check Cloud Run logs [notify])");
  } else if (order.customerEmail?.trim() && base.customerThankYouEmailSent) {
    parts.push("Customer thank-you email sent");
  }
  if (base.adminEmailsSent === 0 && emailTransportPresent) {
    parts.push(`New-order alert not sent (check NOTIFY_OPS_ADMIN_EMAIL / ${opsInbox} and email logs)`);
  } else if (base.adminEmailsSent > 0) {
    parts.push(`New-order alert sent to ${opsInbox}`);
  }
  if (e164) {
    parts.push(base.customerSmsSent ? "SMS queued" : "SMS not sent (check Twilio env / logs)");
  } else {
    parts.push("No US phone for SMS");
  }
  base.message = parts.join(" · ");

  console.info("[post-order-notify] done", order.id, {
    hadCustomerEmail: Boolean(order.customerEmail?.trim()),
    adminEmails: base.adminEmailsSent,
    hadSms: Boolean(e164),
    customerSmsSent: base.customerSmsSent,
  });

  return base;
}
