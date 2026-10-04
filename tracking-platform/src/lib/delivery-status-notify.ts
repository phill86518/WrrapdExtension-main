import type { Order } from "@/lib/types";
import {
  getPublicOrigin,
  sendTransactionalEmail,
  sendTransactionalSms,
  toUsE164,
} from "@/lib/customer-notify";
import { deliveryStatusEmailHtml } from "@/lib/email-templates/transactional";
import { isSmsOptedOut } from "@/lib/service-desk";

export type DeliveryNotifyKind = "out_for_delivery" | "delivered";

function recipientFirstName(order: Order): string {
  const first = (order.recipientName || "").trim().split(/\s+/)[0] || "";
  return first || "your giftee";
}

/**
 * Shopper "out for delivery" / "delivered" text + email. Callers persist the returned
 * timestamp on the order (notifiedOutForDeliveryAt / notifiedDeliveredAt) so each fires once.
 */
export async function notifyDeliveryStatus(order: Order, kind: DeliveryNotifyKind): Promise<string | null> {
  const origin = getPublicOrigin() || "https://wrapstar.wrrapd.com";
  const trackUrl = order.trackingToken ? `${origin}/track/${encodeURIComponent(order.trackingToken)}` : origin;
  const orderRef = order.externalOrderId?.trim() || "your Wrrapd order";
  const who = recipientFirstName(order);
  let sent = false;

  const e164 = toUsE164(order.customerPhone || "");
  if (e164) {
    try {
      if (!(await isSmsOptedOut(e164))) {
        const sms =
          kind === "delivered"
            ? `Wrrapd: Your gift for ${who} was delivered! See the delivery photo: ${trackUrl}`
            : `Wrrapd: Your gift for ${who} is out for delivery today. Track it: ${trackUrl}`;
        sent = (await sendTransactionalSms({ toE164: e164, body: sms })) || sent;
      }
    } catch (e) {
      console.error("[delivery-notify] SMS failed", order.id, kind, e);
    }
  }

  const email = order.customerEmail?.trim();
  if (email) {
    try {
      const ok = await sendTransactionalEmail({
        to: email,
        subject: kind === "delivered" ? `Delivered: your Wrrapd gift for ${who}` : `On its way: your Wrrapd gift for ${who}`,
        html: deliveryStatusEmailHtml({
          customerName: order.customerName,
          customerGreetingName: order.customerGreetingName,
          orderRef,
          recipientFirstName: who,
          kind,
          trackUrl,
          photoUrl:
            kind === "delivered" && order.proofPhotoUrl?.startsWith("https://") ? order.proofPhotoUrl : undefined,
        }),
      });
      sent = ok || sent;
    } catch (e) {
      console.error("[delivery-notify] email failed", order.id, kind, e);
    }
  }
  return sent ? new Date().toISOString() : null;
}
