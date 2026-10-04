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

/** Confirmation-page URL test + order-number patterns, most specific first. */
const RETAILERS = {
  amazon: {
    url: /\/gp\/buy\/thankyou|\/checkout\/.*thank|thankyou|purchaseId=/i,
    patterns: [/\b(\d{3}-\d{7}-\d{7})\b/],
  },
  target: {
    url: /\/(checkout|order)[-/]?confirmation|\/co-thankyou|thank/i,
    patterns: [/order\s*(?:#|number)\s*:?\s*(\d{9,16})/i],
  },
  walmart: {
    url: /\/checkout\/thankyou|\/orders\/\d|thank/i,
    patterns: [/order\s*(?:#|number)\s*:?\s*(\d{7}-\d{8})/i, /order\s*(?:#|number)\s*:?\s*(\d{12,18})/i],
  },
  bestbuy: {
    url: /thank-?you|confirmation/i,
    patterns: [/\b(BBY\d{2}-\d{9,14})\b/i],
  },
  lego: {
    url: /confirmation|thank/i,
    patterns: [/order\s*(?:#|number)\s*:?\s*([A-Z]?\d{8,12})/i],
  },
  etsy: {
    url: /thank|confirmation|\/your\/purchases|receipt/i,
    patterns: [/order\s*(?:#|number)\s*:?\s*(\d{9,12})/i],
  },
  kohls: { url: /confirmation|thank/i, patterns: [] },
  nordstrom: { url: /confirmation|thank/i, patterns: [] },
  sephora: { url: /confirmation|thank/i, patterns: [] },
  ulta: { url: /confirmation|thank/i, patterns: [] },
};

const GENERIC_PATTERN = /order\s*(?:#|no\.?|number|id)\s*:?\s*#?\s*([A-Z]{0,6}\d[A-Z0-9-]{5,24})/i;

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

export function extractRetailerOrderNumber(retailerKey, text) {
  const cfg = RETAILERS[retailerKey];
  const body = String(text || "");
  for (const re of [...(cfg?.patterns || []), GENERIC_PATTERN]) {
    const m = body.match(re);
    const val = m && m[1] ? m[1].toUpperCase() : "";
    if (val && !WRRAPD_ORDER_RE.test(val) && /\d/.test(val)) return val;
  }
  return null;
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
    const cfg = RETAILERS[key];
    if (!cfg || typeof window === "undefined") return;
    if (!cfg.url.test(window.location.pathname + window.location.search)) return;
    void (async () => {
      const pending = (await readPending()).filter((e) => e.retailer === key);
      if (!pending.length) return;
      const entry = pending[pending.length - 1];
      for (let i = 0; i < POLL_TRIES; i++) {
        const num = extractRetailerOrderNumber(key, document.body ? document.body.innerText : "");
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
