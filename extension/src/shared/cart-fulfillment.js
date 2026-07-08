/**
 * Per-line fulfillment detection for retailer carts (non-Amazon).
 * Used to hide Wrrapd when items are pickup-only or mixed pickup + ship.
 */

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const PICKUP_ONLY_RE =
  /only available for (store )?pick\s*up|only available for pickup|pickup only|pick up only|in[-\s]?store only|not available for (home )?delivery|not available for shipping|unavailable for shipping|store pick up only|available only for pickup/i;

const PICKUP_CUE_RE =
  /\bpick\s*up\b|\bstore\s*pickup\b|\bready for pickup\b|\bcurbside\b|\bdrive\s*up\b|\bship\s*to\s*store\b/i;

const SHIPPING_CUE_RE =
  /\bship\s*(it|to|ping)\b|\bships\b|\bdelivery\b|\barrives\b|\bfree shipping\b|\bstandard shipping\b|\bships to\b/i;

/**
 * Classify a cart line item's fulfillment from its DOM subtree.
 * @returns {"pickup"|"shipping"|"mixed"|"unknown"}
 */
export function detectItemFulfillment(node) {
  const text = normalizeWhitespace(node?.textContent || "").toLowerCase();
  if (!text) return "unknown";
  if (PICKUP_ONLY_RE.test(text)) return "pickup";

  const hasPickup = PICKUP_CUE_RE.test(text);
  const hasShipping = SHIPPING_CUE_RE.test(text);
  if (hasPickup && hasShipping) return "mixed";
  if (hasPickup) return "pickup";
  if (hasShipping) return "shipping";
  return "unknown";
}

/**
 * @param {object} cartSnapshot
 * @returns {{
 *   allPickupOnly: boolean,
 *   hasMixedPickupAndShip: boolean,
 *   pickupOnlyCount: number,
 *   shippableCount: number,
 *   unknownCount: number,
 *   fulfillmentCounts: Record<string, number>,
 * }}
 */
export function analyzeCartFulfillment(cartSnapshot) {
  const items = Array.isArray(cartSnapshot?.items) ? cartSnapshot.items : [];
  const fulfillmentCounts = { shipping: 0, pickup: 0, mixed: 0, unknown: 0 };

  for (const item of items) {
    const f = item?.fulfillment || "unknown";
    fulfillmentCounts[f] = (fulfillmentCounts[f] || 0) + 1;
  }

  const pickupOnlyCount = fulfillmentCounts.pickup || 0;
  const mixedCount = fulfillmentCounts.mixed || 0;
  const shippingCount = fulfillmentCounts.shipping || 0;
  const unknownCount = fulfillmentCounts.unknown || 0;

  const allPickupOnly = items.length > 0 && pickupOnlyCount === items.length;
  const hasShippable = shippingCount > 0 || mixedCount > 0 || unknownCount > 0;
  const hasMixedPickupAndShip =
    items.length > 1 && pickupOnlyCount > 0 && hasShippable && pickupOnlyCount < items.length;

  return {
    allPickupOnly,
    hasMixedPickupAndShip,
    pickupOnlyCount,
    shippableCount: shippingCount + mixedCount + unknownCount,
    unknownCount,
    fulfillmentCounts,
  };
}

export function buildPickupOnlyNotice(retailerLabel) {
  const retailer = retailerLabel || "This store";
  const wrap = document.createElement("div");
  wrap.setAttribute("data-wrrapd-fulfillment-notice", "pickup-only");
  wrap.style.cssText =
    "box-sizing:border-box;width:100%;margin:0 0 12px;padding:14px 16px;background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:10px;font-size:13px;line-height:1.55;color:#7f1d1d;";
  wrap.innerHTML =
    `<strong>Wrrapd gift-wrapping isn't available for this cart.</strong> ` +
    `Every item here is <strong>store pickup only</strong> at ${retailer}. ` +
    "Wrrapd needs items shipped to our studio first, so pickup-only products can't be gift-wrapped through Wrrapd.";
  return wrap;
}

export function buildMixedFulfillmentNotice(retailerLabel) {
  const retailer = retailerLabel || "This store";
  const wrap = document.createElement("div");
  wrap.setAttribute("data-wrrapd-fulfillment-notice", "mixed-pickup");
  wrap.style.cssText =
    "box-sizing:border-box;width:100%;margin:0 0 12px;padding:14px 16px;background:#fffbeb;border:1px solid #fcd34d;border-left:4px solid #ff8e14;border-radius:10px;font-size:13px;line-height:1.55;color:#78350f;";
  wrap.innerHTML =
    `<strong>This cart mixes store pickup and shippable items.</strong> ` +
    `${retailer} ships an entire order to one address, so Wrrapd can't gift-wrap only part of this checkout. ` +
    "Items that <em>can</em> ship may still be gift-wrapped with Wrrapd — please place those in a <strong>separate order</strong> without any pickup-only items.";
  return wrap;
}
