import { getOrdersCollection, listAllOrders, patchOrderFields } from "@/lib/data";
import type { Order } from "@/lib/types";

const MAX_REFS = 6;

/** Retailer order numbers are letters, digits, dashes (Amazon 112-1234567-1234567, Target 912000123456, …). */
export function normalizeRetailerOrderNumber(raw: unknown): string | null {
  const s = String(raw ?? "")
    .trim()
    .replace(/^#/, "")
    .replace(/\s+/g, "")
    .toUpperCase();
  return /^[A-Z0-9][A-Z0-9-]{3,39}$/.test(s) ? s : null;
}

export async function addRetailerOrderNumber(order: Order, num: string, updatedBy: string): Promise<Order | null> {
  const existing = order.retailerOrderNumbers || [];
  if (existing.includes(num)) return order;
  if (existing.length >= MAX_REFS) return order;
  return patchOrderFields(order.id, { retailerOrderNumbers: [...existing, num] }, updatedBy);
}

export async function listOrdersByExternalId(externalOrderId: string): Promise<Order[]> {
  const id = externalOrderId.trim();
  if (!id) return [];
  const oc = getOrdersCollection();
  if (oc) {
    const snap = await oc.where("externalOrderId", "==", id).get();
    return snap.docs.map((d) => d.data() as Order);
  }
  return (await listAllOrders()).filter((o) => o.externalOrderId === id);
}