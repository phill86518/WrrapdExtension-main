/**
 * Shopify-channel-only privacy + retention.
 *
 * HARD BOUNDARY: These helpers must never read or mutate Chrome extension,
 * wrrapd.com /buy, Amazon, Target, or any non-Shopify order. Matching is
 * exclusively `order.retailer === "Shopify"` (set only by the Shopify ingest path).
 */
import type { Order, OrderLineItem } from "@/lib/types";
import { listAllOrders, patchOrderFields } from "@/lib/data";

const REDACTED = "[redacted]";

/** Sole gate for Shopify privacy / retention. Do not broaden. */
export function isShopifyChannelOrder(o: Order | null | undefined): boolean {
  return o?.retailer === "Shopify";
}

function shopPrefix(shop: string): string {
  const s = String(shop || "")
    .trim()
    .toLowerCase()
    .replace(/\.myshopify\.com$/i, "");
  return s ? `SH-${s}-` : "";
}

function belongsToShopifyShop(o: Order, shop: string): boolean {
  if (!isShopifyChannelOrder(o)) return false;
  const prefix = shopPrefix(shop);
  if (!prefix) return false;
  const ext = String(o.externalOrderId || "").toLowerCase();
  return ext.startsWith(prefix.toLowerCase());
}

function redactLineItems(items: OrderLineItem[] | undefined): OrderLineItem[] | undefined {
  if (!items?.length) return items;
  return items.map((it) => ({
    ...it,
    giftMessage: it.giftMessage ? REDACTED : it.giftMessage,
    senderName: it.senderName ? REDACTED : it.senderName,
  }));
}

/**
 * Strip giftee / shopper PII on a Shopify order only.
 * Returns null if the order is not Shopify — caller must not patch.
 */
export function anonymizeShopifyOrderFields(order: Order): Partial<Order> | null {
  if (!isShopifyChannelOrder(order)) {
    return null;
  }
  return {
    recipientName: REDACTED,
    addressLine1: REDACTED,
    addressLine2: "",
    city: REDACTED,
    state: "XX",
    postalCode: "00000",
    customerPhone: order.customerPhone ? REDACTED : order.customerPhone,
    customerEmail: order.customerEmail ? REDACTED : order.customerEmail,
    customerEmailNorm: order.customerEmailNorm ? REDACTED : order.customerEmailNorm,
    customerGreetingName: order.customerGreetingName ? REDACTED : order.customerGreetingName,
    deliveryInstructions: order.deliveryInstructions ? REDACTED : order.deliveryInstructions,
    lineItems: redactLineItems(order.lineItems),
    proofPhotoUrl: undefined,
    wrapPhotoUrl: undefined,
    latestLocation: undefined,
    deliveryProof: undefined,
  };
}

async function patchShopifyOnly(order: Order, updatedBy: string): Promise<boolean> {
  const patch = anonymizeShopifyOrderFields(order);
  if (!patch) return false;
  await patchOrderFields(order.id, patch, updatedBy);
  return true;
}

export async function collectShopifyCustomerData(opts: {
  shop: string;
  email?: string;
  orderIds?: Array<string | number>;
}): Promise<{ orders: Array<Record<string, unknown>>; count: number; scope: "shopify-only" }> {
  const email = String(opts.email || "")
    .trim()
    .toLowerCase();
  const shop = String(opts.shop || "").trim();
  const all = await listAllOrders();
  const matched = all.filter((o) => {
    // Never consider non-Shopify channels
    if (!isShopifyChannelOrder(o)) return false;
    if (!belongsToShopifyShop(o, shop)) return false;
    if (email) {
      const norm = String(o.customerEmailNorm || o.customerEmail || "")
        .trim()
        .toLowerCase();
      return norm === email;
    }
    return true;
  });

  const orders = matched.map((o) => ({
    id: o.id,
    retailer: o.retailer,
    externalOrderId: o.externalOrderId,
    status: o.status,
    createdAt: o.createdAt,
    deliveredAt: o.deliveredAt,
    recipientName: o.recipientName,
    city: o.city,
    state: o.state,
    postalCode: o.postalCode,
    customerEmail: o.customerEmail,
  }));
  return { orders, count: orders.length, scope: "shopify-only" };
}

export async function redactShopifyCustomer(opts: {
  shop: string;
  email?: string;
}): Promise<{ redacted: number; ids: string[]; skippedNonShopify: number; scope: "shopify-only" }> {
  const email = String(opts.email || "")
    .trim()
    .toLowerCase();
  const shop = String(opts.shop || "").trim();
  const all = await listAllOrders();
  const ids: string[] = [];
  let skippedNonShopify = 0;
  for (const o of all) {
    if (!isShopifyChannelOrder(o)) {
      skippedNonShopify += 1;
      continue;
    }
    if (!belongsToShopifyShop(o, shop)) continue;
    if (email) {
      const norm = String(o.customerEmailNorm || o.customerEmail || "")
        .trim()
        .toLowerCase();
      if (norm !== email) continue;
    }
    if (await patchShopifyOnly(o, "shopify-privacy-redact")) ids.push(o.id);
  }
  return { redacted: ids.length, ids, skippedNonShopify, scope: "shopify-only" };
}

export async function redactShopifyShop(
  shop: string,
): Promise<{ redacted: number; ids: string[]; scope: "shopify-only" }> {
  const all = await listAllOrders();
  const ids: string[] = [];
  for (const o of all) {
    if (!isShopifyChannelOrder(o)) continue;
    if (!belongsToShopifyShop(o, shop)) continue;
    if (await patchShopifyOnly(o, "shopify-shop-redact")) ids.push(o.id);
  }
  return { redacted: ids.length, ids, scope: "shopify-only" };
}

const MONTHS_MS = 365.25 * 24 * 60 * 60 * 1000; // ~12 months

/**
 * Monthly retention for Shopify App Privacy Addendum only.
 * Chrome extension / website / other-retailer orders are never scanned for deletion here.
 */
export async function purgeShopifyRecipientsPastRetention(): Promise<{
  scannedShopify: number;
  redacted: number;
  ids: string[];
  scope: "shopify-only";
}> {
  const cutoff = Date.now() - MONTHS_MS;
  const all = await listAllOrders();
  const ids: string[] = [];
  let scannedShopify = 0;
  for (const o of all) {
    if (!isShopifyChannelOrder(o)) continue;
    scannedShopify += 1;
    if (o.status !== "delivered" || !o.deliveredAt) continue;
    const deliveredMs = new Date(o.deliveredAt).getTime();
    if (!Number.isFinite(deliveredMs) || deliveredMs > cutoff) continue;
    if (o.recipientName === REDACTED && o.addressLine1 === REDACTED) continue;
    if (await patchShopifyOnly(o, "shopify-retention-12mo")) ids.push(o.id);
  }
  return { scannedShopify, redacted: ids.length, ids, scope: "shopify-only" };
}
