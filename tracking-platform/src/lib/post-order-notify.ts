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
  formatOrderScheduleEt,
  thankYouEmailHtml,
} from "@/lib/email-templates/transactional";
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

function adminOrderNotifyEmails(): string[] {
  const raw = process.env.NOTIFY_ADMIN_ORDER_EMAILS?.trim();
  if (!raw) return ["admin@wrrapd.com"];
  const parsed = raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const all = [...parsed, "admin@wrrapd.com"];
  return [...new Set(all.map((x) => x.toLowerCase()))];
}

/** Admins to BCC on the customer thank-you (same message as customer); excludes customer so we do not duplicate To. */
function adminEmailsExcludingCustomer(customerEmail: string | undefined): string[] {
  const admins = adminOrderNotifyEmails();
  const ce = customerEmail?.trim().toLowerCase();
  if (!ce) return admins;
  return admins.filter((e) => e.toLowerCase() !== ce);
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

  const adminTos = adminOrderNotifyEmails();
  console.info("[post-order-notify] start", order.id, {
    hasCustomerEmail: Boolean(order.customerEmail?.trim()),
    adminRecipients: adminTos.length,
  });

  const origin = getPublicOrigin();
  const trackingPath = `/track/${order.trackingToken}`;
  const trackingUrl = origin ? `${origin}${trackingPath}` : trackingPath;
  const addressLine = `${order.addressLine1}, ${order.city}, ${order.state} ${order.postalCode}`;
  const scheduledEtLabel = formatOrderScheduleEt(order.scheduledFor);
  const displayOrderId = order.externalOrderId?.trim() || order.id;

  const thankYouSubject = `Thank you — Wrrapd order ${displayOrderId}`;
  const thankYouHtml = thankYouEmailHtml({
    customerName: order.customerName,
    customerGreetingName: order.customerGreetingName,
    orderId: displayOrderId,
    trackingUrl,
    recipientName: order.recipientName,
    addressLine,
    scheduledEtLabel,
    lineItems: order.lineItems,
  });

  if (order.customerEmail?.trim()) {
    try {
      const adminBcc = adminEmailsExcludingCustomer(order.customerEmail.trim());
      const ok = await sendTransactionalEmail({
        to: order.customerEmail.trim(),
        subject: thankYouSubject,
        html: thankYouHtml,
        ...(adminBcc.length ? { bcc: adminBcc.join(", ") } : {}),
      });
      base.customerThankYouEmailSent = ok;
      if (ok && adminBcc.length) {
        console.info("[post-order-notify] thank-you sent with admin BCC", order.id, { bccCount: adminBcc.length });
      }
    } catch (e) {
      console.error("[post-order-notify] customer thank-you email failed", order.id, e);
    }
  }

  if (adminTos.length) {
    const adminHtml = adminNewOrderEmailHtml({
      orderId: order.id,
      externalOrderId: order.externalOrderId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      recipientName: order.recipientName,
      addressLine1: order.addressLine1,
      addressLine2: order.addressLine2,
      city: order.city,
      state: order.state,
      postalCode: order.postalCode,
      scheduledEtLabel,
      trackingUrl,
      sourceNote: order.sourceNote,
      deliveryPreferencePending: order.deliveryPreferencePending,
      amazonDeliveryDatesSnapshot: order.amazonDeliveryDatesSnapshot,
      lineItems: order.lineItems,
    });
    const adminSubject = `New Wrrapd order ${order.id}${order.externalOrderId ? ` (${order.externalOrderId})` : ""}`;
    try {
      // One SMTP/Mailgun message to all admins avoids duplicate suppression and rate limits from back-to-back sends.
      const ok = await sendTransactionalEmail({
        to: adminTos.join(", "),
        subject: adminSubject,
        html: adminHtml,
      });
      if (ok) base.adminEmailsSent = adminTos.length;
    } catch (e) {
      console.error("[post-order-notify] admin new-order email failed", order.id, e);
    }
  }

  const e164 = toUsE164(order.customerPhone);
  if (e164) {
    const sms =
      `Wrrapd: Thanks for your order ${order.id}! Track: ${trackingUrl} ` +
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
          subject: `Action needed: Wrrapd delivery schedule for order ${displayOrderId}`,
          html: deliveryChoiceEmailHtml({
            customerName: order.customerName,
            customerGreetingName: order.customerGreetingName,
            orderId: displayOrderId,
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
    parts.push("No email transport on Cloud Run (set SMTP_HOST, SMTP_USER, SMTP_PASS or Mailgun vars)");
  } else if (order.customerEmail?.trim() && !base.customerThankYouEmailSent) {
    parts.push("Customer thank-you email not sent (check Cloud Run logs [notify])");
  } else if (order.customerEmail?.trim() && base.customerThankYouEmailSent) {
    parts.push("Customer thank-you email sent");
  }
  if (adminTos.length && base.adminEmailsSent === 0 && emailTransportPresent) {
    parts.push(`Admin emails 0/${adminTos.length} (check NOTIFY_ADMIN_ORDER_EMAILS and email logs)`);
  } else if (adminTos.length) {
    parts.push(`Admin emails ${base.adminEmailsSent}/${adminTos.length}`);
  } else if (!adminTos.length) {
    parts.push("No NOTIFY_ADMIN_ORDER_EMAILS set");
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
