import type { Order } from "@/lib/types";
import {
  getPublicOrigin,
  sendTransactionalEmail,
  sendTransactionalSms,
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

function adminOrderNotifyEmails(): string[] {
  const raw = process.env.NOTIFY_ADMIN_ORDER_EMAILS?.trim();
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function sendPostOrderNotifications(order: Order): Promise<void> {
  if (process.env.TRACKING_NOTIFY_NEW_ORDERS === "false") {
    console.info("[post-order-notify] skipped (TRACKING_NOTIFY_NEW_ORDERS=false)", order.id);
    return;
  }

  const origin = getPublicOrigin();
  const trackingPath = `/track/${order.trackingToken}`;
  const trackingUrl = origin ? `${origin}${trackingPath}` : trackingPath;
  const addressLine = `${order.addressLine1}, ${order.city}, ${order.state} ${order.postalCode}`;
  const scheduledEtLabel = formatOrderScheduleEt(order.scheduledFor);

  const thankYouSubject = `Thank you — Wrrapd order ${order.id}`;
  const thankYouHtml = thankYouEmailHtml({
    customerName: order.customerName,
    orderId: order.id,
    trackingUrl,
    recipientName: order.recipientName,
    addressLine,
    scheduledEtLabel,
  });

  if (order.customerEmail?.trim()) {
    try {
      await sendTransactionalEmail({
        to: order.customerEmail.trim(),
        subject: thankYouSubject,
        html: thankYouHtml,
      });
    } catch (e) {
      console.error("[post-order-notify] customer thank-you email failed", order.id, e);
    }
  }

  const adminTos = adminOrderNotifyEmails();
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
    });
    const adminSubject = `New Wrrapd order ${order.id}${order.externalOrderId ? ` (${order.externalOrderId})` : ""}`;
    for (const to of adminTos) {
      try {
        await sendTransactionalEmail({
          to,
          subject: adminSubject,
          html: adminHtml,
        });
      } catch (e) {
        console.error("[post-order-notify] admin email failed", order.id, to, e);
      }
    }
  }

  const e164 = toUsE164(order.customerPhone);
  if (e164) {
    const sms =
      `Wrrapd: Thanks for your order ${order.id}! Track: ${trackingUrl} ` +
      `Delivery window ${scheduledEtLabel}.`;
    try {
      await sendTransactionalSms({ toE164: e164, body: sms.slice(0, 1500) });
    } catch (e) {
      console.error("[post-order-notify] customer SMS failed", order.id, e);
    }
  }

  if (
    order.deliveryPreferencePending &&
    order.deliveryPreferenceToken &&
    order.amazonDeliveryDatesSnapshot &&
    order.amazonDeliveryDatesSnapshot.length > 1
  ) {
    const choicePath = `/delivery-choice?t=${encodeURIComponent(order.deliveryPreferenceToken)}`;
    const choiceUrl = origin ? `${origin}${choicePath}` : choicePath;
    const deadline = order.deliveryPreferenceRespondBy
      ? formatInTimeZone(new Date(order.deliveryPreferenceRespondBy), NY, "EEEE, MMM d, yyyy · h:mm a zzz")
      : "end of today (Eastern)";

    if (order.customerEmail?.trim()) {
      try {
        await sendTransactionalEmail({
          to: order.customerEmail.trim(),
          subject: `Action needed: Wrrapd delivery schedule for order ${order.id}`,
          html: deliveryChoiceEmailHtml({
            customerName: order.customerName,
            orderId: order.id,
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

  console.info("[post-order-notify] done", order.id, {
    hadCustomerEmail: Boolean(order.customerEmail?.trim()),
    adminEmails: adminTos.length,
    hadSms: Boolean(e164),
  });
}
