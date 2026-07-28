/**
 * Notify courier drivers when assigned to an order that needs flower pickup.
 */
import { sendTransactionalEmail, sendTransactionalSms } from "@/lib/customer-notify";
import type { FlowerPickupLocation, Order } from "@/lib/types";
import { findDeliveryDriverById } from "@/lib/driver-registry";
import { orderNeedsFlowerPickup } from "@/lib/driver-label-qr";

function retailerLabel(r: string): string {
  if (r === "publix") return "Publix";
  if (r === "target") return "Target";
  if (r === "sams") return "Sam's Club";
  return r;
}

function pickupSummary(locations: FlowerPickupLocation[] | undefined): string {
  if (!locations?.length) return "Flower pickup required (see Admin for store details).";
  return locations
    .map(
      (fp) =>
        `${retailerLabel(fp.retailer)} — ${fp.storeName}, ${fp.address}, ${fp.city}, ${fp.state} ${fp.postalCode} (${fp.productTitle})`,
    )
    .join("\n");
}

export async function notifyCourierFlowerPickup(order: Order): Promise<void> {
  if (!order.courierDriverId || !orderNeedsFlowerPickup(order)) return;
  const driver = await findDeliveryDriverById(order.courierDriverId);
  if (!driver) return;
  const ref = order.externalOrderId?.trim() || order.id;
  const summary = pickupSummary(order.flowerPickup);
  const subject = `Wrrapd flower pickup — order ${ref}`;
  const html = `<!DOCTYPE html><html><body style="font-family:Georgia,serif;color:#0f172a;">
    <p>Hi ${escapeHtml(driver.name || "driver")},</p>
    <p>You have been assigned order <strong>${escapeHtml(ref)}</strong> that includes flowers. Please pick up from:</p>
    <pre style="white-space:pre-wrap;background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0;">${escapeHtml(summary)}</pre>
    <p>Giftee: ${escapeHtml(order.recipientName)} — ${escapeHtml(order.addressLine1)}, ${escapeHtml(order.city)}, ${escapeHtml(order.state)} ${escapeHtml(order.postalCode)}</p>
    <p>— Wrrapd</p>
  </body></html>`;

  if (driver.email?.trim()) {
    await sendTransactionalEmail({
      to: driver.email.trim(),
      subject,
      html,
    }).catch((e) => console.error("[driver-flower-notify] email", e));
  }
  if (driver.phone?.trim()) {
    const sms = `Wrrapd: flower pickup for order ${ref}. ${summary.slice(0, 280)}`;
    await sendTransactionalSms({ toE164: driver.phone.trim(), body: sms }).catch((e) =>
      console.error("[driver-flower-notify] sms", e),
    );
  }
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
