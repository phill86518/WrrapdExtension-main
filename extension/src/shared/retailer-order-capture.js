/**
 * After Pay Wrrapd succeeds, remember the Wrrapd order number. When the shopper lands on the retailer's
 * order-confirmation page, read the retailer's order number (it matches the packing slip at the hub) and
 * send only { orderNumber, retailerOrderNumber, retailer } to api.wrrapd.com. Nothing else on the page is sent.
 *
 * Every step is best-effort and wrapped so it can never interrupt checkout.
 */

const STORE_KEY = "wrrapdPendingRetailerCapture";
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const POLL_MS = 1000;
const POLL_TRIES = 30;
const WRRAPD_ORDER_RE = /^[A-Z]{2}-[0-9A-Z]{9}-[0-9A-Z]{6}$/;

/** The page says an order was just placed (every retailer's thank-you page has one of these). */
const CONFIRMATION_TEXT =
  /thank(s| you)[^.\n]{0,40}\border\b|\border (has been |is |was )?(placed|confirmed|received|complete)|we('ve| have) (got|received) your order|order confirmation|your order number is/i;

/**
 * Retailer order-number shapes (researched Oct 2026 from confirmation emails / order pages):
 * Amazon 112-3456789-1234567 · Target 912002895833290 (15 digits, 9120/9020/1020…) · Walmart 13–15 digits
 * or 2000123-45678901 · Best Buy BBY01-806587123456 · Kohl's 6514816483 (10) · Nordstrom 818411566 (9) ·
 * Sephora US 22900944454 (11; older 10) · Ulta K190000004 (letter + 9) · LEGO T461059900 (T/TS + 9–10) ·
 * Etsy receipt 3123456789 (10).
 * `shape` must match the whole candidate; `bare` may be found anywhere on the confirmation page because the
 * shape is unmistakable; other shapes need an "Order #/number" label right before them.
 */
const RETAILERS = {
  amazon: { shape: /^\d{3}-\d{7}-\d{7}$/, bare: /\b(\d{3}-\d{7}-\d{7})\b/ },
  target: { shape: /^\d{15}$/, bare: /\b((?:9[01]2|102)\d{12})\b/ },
  walmart: { shape: /^(?:\d{7}-\d{8}|\d{13,15})$/, bare: /\b(\d{7}-\d{8})\b/ },
  bestbuy: { shape: /^BBY\d{2}-\d{9,14}$/, bare: /\b(BBY\d{2}-\d{9,14})\b/i },
  kohls: { shape: /^\d{10}$/ },
  nordstrom: { shape: /^\d{9,10}$/ },
  sephora: { shape: /^(?:\d{10,12}|LX[A-Z0-9]{6,14})$/ },
  ulta: { shape: /^[A-Z]\d{9}$/ },
  lego: { shape: /^(?:TS?\d{9,10}|\d{10})$/, bare: /\b(TS?\d{9,10})\b/ },
  etsy: { shape: /^\d{9,12}$/ },
};

/** "Order #: X", "Order number X", "Order No. X", "Order ID: X", "Order# X". */
const LABELED = /\border\s*(?:#|no\.?|number|num|id|confirmation(?:\s*number)?)\s*(?:is)?\s*[:#]?\s*#?\s*([A-Z]{0,5}[- ]?\d[\dA-Z-]{4,24})/gi;

/** Analytics / page data embedded in the confirmation page, e.g. "orderId":"912002895833290". */
const EMBEDDED = /["'](?:orderId|orderNumber|order_id|order_number|transactionId|transaction_id|purchaseId|confirmationNumber)["']\s*:\s*["']?([A-Z0-9-]{6,30})/gi;

function storage() {
  try {
    return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local ? chrome.storage.local : null;
  } catch {
    return null;
  }
}

async function readPending() {
  const s = storage();
  if (!s) return [];
  try {
    const got = await s.get(STORE_KEY);
    const list = Array.isArray(got?.[STORE_KEY]) ? got[STORE_KEY] : [];
    const now = Date.now();
    return list.filter((e) => e && typeof e.orderNumber === "string" && now - Number(e.at || 0) < MAX_AGE_MS);
  } catch {
    return [];
  }
}

async function writePending(list) {
  const s = storage();
  if (!s) return;
  try {
    await s.set({ [STORE_KEY]: list.slice(-5) });
  } catch {
    /* ignore */
  }
}

/** Call once Pay Wrrapd's process-payment has succeeded. */
export async function rememberPaidOrderForCapture(retailerKey, orderNumber) {
  try {
    const n = String(orderNumber || "").trim();
    if (!WRRAPD_ORDER_RE.test(n)) return;
    const key = String(retailerKey || "").toLowerCase().replace(/[^a-z]/g, "");
    const list = (await readPending()).filter((e) => e.orderNumber !== n);
    list.push({ retailer: key, orderNumber: n, at: Date.now() });
    await writePending(list);
  } catch {
    /* never block checkout */
  }
}

function clean(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-+$/, "");
}

/**
 * @param {string} retailerKey
 * @param {string} text visible page text
 * @param {string} [embedded] text of inline page-data scripts (optional fallback)
 */
export function extractRetailerOrderNumber(retailerKey, text, embedded = "") {
  const cfg = RETAILERS[retailerKey];
  if (!cfg) return null;
  const body = String(text || "");
  if (!CONFIRMATION_TEXT.test(body)) return null;
  const ok = (v) => v && !WRRAPD_ORDER_RE.test(v) && cfg.shape.test(v);

  for (const m of body.matchAll(LABELED)) {
    const v = clean(m[1]);
    if (ok(v)) return v;
  }
  if (cfg.bare) {
    const m = body.match(cfg.bare);
    const v = m ? clean(m[1]) : "";
    if (ok(v)) return v;
  }
  for (const m of String(embedded || "").matchAll(EMBEDDED)) {
    const v = clean(m[1]);
    if (ok(v)) return v;
  }
  return null;
}

function embeddedPageData() {
  try {
    let out = "";
    for (const s of document.querySelectorAll('script[type="application/ld+json"], script[type="application/json"], script:not([src])')) {
      const t = s.textContent || "";
      if (t.length > 400_000 || !/order|transaction|purchase/i.test(t)) continue;
      out += t + "\n";
      if (out.length > 1_500_000) break;
    }
    return out;
  } catch {
    return "";
  }
}

async function send(entry, retailerOrderNumber) {
  const resp = await fetch("https://api.wrrapd.com/api/retailer-order-ref", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderNumber: entry.orderNumber, retailerOrderNumber, retailer: entry.retailer }),
  });
  return resp.ok || resp.status === 404 || resp.status === 400;
}

/** Call on every page of the retailer's site (content-script entry). Does nothing unless a paid order is pending. */
export function startRetailerOrderCapture(retailerKey) {
  try {
    const key = String(retailerKey || "").toLowerCase().replace(/[^a-z]/g, "");
    if (!RETAILERS[key] || typeof window === "undefined") return;
    void (async () => {
      const pending = (await readPending()).filter((e) => e.retailer === key);
      if (!pending.length) return;
      const entry = pending[pending.length - 1];
      for (let i = 0; i < POLL_TRIES; i++) {
        const text = document.body ? document.body.innerText : "";
        const num = CONFIRMATION_TEXT.test(text) ? extractRetailerOrderNumber(key, text, embeddedPageData()) : null;
        if (num) {
          try {
            if (await send(entry, num)) {
              const rest = (await readPending()).filter((e) => e.orderNumber !== entry.orderNumber);
              await writePending(rest);
            }
          } catch {
            /* retried on the next confirmation-page load */
          }
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    })();
  } catch {
    /* never block the page */
  }
}
