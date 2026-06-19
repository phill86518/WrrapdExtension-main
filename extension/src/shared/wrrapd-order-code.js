/**
 * Wrrapd order-number codes.
 *
 * Every Wrrapd order number starts with a fixed 2-letter retailer code (never
 * the retailer name). The same code is used by the cart opt-in, the checkout
 * pay flow, the pay server record, and the customer confirmation email so a
 * single order is identifiable everywhere. These Wrrapd order numbers are
 * deliberately distinct from the retailer's own order number.
 */

/** Ordered so the first substring/prefix match wins. */
const RETAILER_ORDER_CODES = [
  ["amazon", "AZ"],
  ["target", "TG"],
  ["nordstrom", "NS"],
  ["sephora", "SF"],
  ["walmart", "WM"],
  ["bestbuy", "BB"],
  ["kohls", "KS"],
  ["etsy", "EC"],
  ["ulta", "UT"],
  ["lego", "LG"],
];

/**
 * Map a retailer name ("Sephora", "Best Buy") or session prefix
 * ("wrrapdSephora") — including truncated prefixes like "WRRAPDUL" — to its
 * 2-letter Wrrapd code. Falls back to "WR" for anything unknown.
 * @param {string} input
 * @returns {string}
 */
export function wrrapdRetailerCode(input) {
  const norm = String(input || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/^wrrapd/, "");
  if (norm.length >= 2) {
    for (const [key, code] of RETAILER_ORDER_CODES) {
      if (norm.includes(key) || key.startsWith(norm)) return code;
    }
  }
  return "WR";
}

/**
 * `<CODE>-<base36 time>-<random>` — e.g. `SF-MQK3ATYM-R6LJUM`.
 * @param {string} input retailer name or session prefix
 * @returns {string}
 */
export function generateWrrapdOrderNumber(input) {
  const code = wrrapdRetailerCode(input);
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${code}-${ts}-${rand}`;
}
