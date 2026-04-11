import type { Order } from "@/lib/types";
import {
  getPublicOrigin,
  sendTransactionalEmail,
  sendTransactionalSms,
  toUsE164,
} from "@/lib/customer-notify";
import {
  deliveryChoiceEmailHtml,
  formatOrderScheduleEt,
  thankYouEmailHtml,
} from "@/lib/email-templates/transactional";
import { formatInTimeZone } from "date-fns-tz";

const NY = "America/New_York";

export async function sendPostOrderNotifications(order: Order): Promise<void> {
  if (process.env.TRACKING_NOTIFY_NEW_ORDERS === "false") {
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
    await sendTransactionalEmail({
      to: order.customerEmail.trim(),
      subject: thankYouSubject,
      html: thankYouHtml,
    });
  }

  const e164 = toUsE164(order.customerPhone);
  if (e164) {
    const sms =
      `Wrrapd: Thanks for your order ${order.id}! Track: ${trackingUrl} ` +
      `Delivery window ${scheduledEtLabel}.`;
    await sendTransactionalSms({ toE164: e164, body: sms.slice(0, 1500) });
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
    }

    if (e164) {
      const m =
        `Wrrapd: Your Amazon items have different delivery dates (${order.amazonDeliveryDatesSnapshot.join(", ")}). ` +
        `We're planning one Wrrapd visit after the LAST Amazon date unless you choose faster: ${choiceUrl} ` +
        `Reply isn't supported — use the link by ${deadline}.`;
      await sendTransactionalSms({ toE164: e164, body: m.slice(0, 1500) });
    }
  }
}
