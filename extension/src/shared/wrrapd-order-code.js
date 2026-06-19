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

/** Exactly `n` uppercase base36 characters (robust against short Math.random output). */
function randBase36(n) {
  let s = "";
  while (s.length < n) s += Math.random().toString(36).slice(2);
  return s.slice(0, n).toUpperCase();
}

/**
 * Every Wrrapd order number — for every retailer — uses one identical
 * fixed-length shape: `CC-TTTTTTTTT-RRRRRR`
 *   - `CC`        2-letter retailer code
 *   - `TTTTTTTTT` 9-char base36 timestamp (zero-padded; chronological)
 *   - `RRRRRR`    6-char base36 random
 * Total length is always 19 characters, identical across Amazon, LEGO, and
 * every other retailer.
 * @param {string} input retailer name or session prefix
 * @returns {string}
 */
export function generateWrrapdOrderNumber(input) {
  const code = wrrapdRetailerCode(input);
  const time = Date.now().toString(36).toUpperCase().padStart(9, "0").slice(-9);
  const rand = randBase36(6);
  return `${code}-${time}-${rand}`;
}
