import { formatInTimeZone } from "date-fns-tz";
import { listAllOrders } from "@/lib/data";
import { formatDateKeyNy } from "@/lib/ny-date";
import type { HeldItem, Order } from "@/lib/types";

export const CUSTOMER_SERVICE_PHONE_LABEL = "(844) 638-5484";
export const CUSTOMER_SERVICE_PHONE_E164 = "+18446385484";
export const HELD_ITEM_PICKUP_HOURS = 48;

const DONE = new Set(["delivered", "cancelled", "refunded"]);

export function etLabel(iso: string): string {
  return formatInTimeZone(new Date(iso), "America/New_York", "EEE MMM d, h:mm a 'ET'");
}

/**
 * Paid order with no retailer order number and no package at the hub.
 * `includeToday` = also flag orders placed today (used by the end-of-day job).
 */
export function isMissingRetailerOrder(o: Order, includeToday: boolean, now = new Date()): boolean {
  if (DONE.has(o.status)) return false;
  if (!o.externalOrderId?.trim()) return false;
  if ((o.retailerOrderNumbers || []).length) return false;
  if (o.hubReceipt) return false;
  const placed = formatDateKeyNy(o.createdAt);
  const today = formatDateKeyNy(now);
  if (!placed || !today) return false;
  return includeToday ? placed <= today : placed < today;
}

export type HeldItemRow = { order: Order; item: HeldItem; overdue: boolean };

export function openHeldItems(orders: Order[], now = new Date()): HeldItemRow[] {
  const rows: HeldItemRow[] = [];
  for (const order of orders) {
    for (const item of order.heldItems || []) {
      if (item.status !== "held") continue;
      rows.push({ order, item, overdue: Date.parse(item.pickupBy) < now.getTime() });
    }
  }
  return rows.sort((a, b) => a.item.pickupBy.localeCompare(b.item.pickupBy));
}

export async function loadHubExceptions(includeToday: boolean) {
  const orders = await listAllOrders();
  const now = new Date();
  return {
    missingRetailerOrder: orders
      .filter((o) => isMissingRetailerOrder(o, includeToday, now))
      .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")),
    heldItems: openHeldItems(orders, now),
  };
}
