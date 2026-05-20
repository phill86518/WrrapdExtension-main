/**
 * Shared retailer metadata for multi-bundle content scripts.
 * Phase-1: tier classification + customer-facing hints (no DOM).
 */

/** One ship-to per checkout (Ulta, Walmart, Nordstrom, Kohl's, Sephora, Etsy, LEGO, Target, …). */
export const SHIPPING_TIER_SINGLE = "single";

/**
 * Best Buy: item-level fulfillment options exist, but one ZIP per order
 * (not Amazon-class multi-address).
 */
export const SHIPPING_TIER_BESTBUY_LIMITED = "bestbuy_limited";

/**
 * @param {string} tier
 * @returns {string} Short UI-safe explanation
 */
export function describeTierForUi(tier) {
  switch (tier) {
    case SHIPPING_TIER_BESTBUY_LIMITED:
      return "One shipping ZIP per order; shipping vs store pickup can vary by item.";
    case SHIPPING_TIER_SINGLE:
    default:
      return "One shipping address per order; use separate orders for different destinations.";
  }
}
