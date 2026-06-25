/**
 * Capture a retailer's *delivery / arrival* date from a checkout (or cart) page.
 *
 * Wrrapd schedules its own delivery for the **retailer's promised delivery date + 1 day**
 * (the item has to reach the Wrrapd studio, get wrapped, then go out). To do that the pay
 * server needs the retailer's own estimated delivery date — which, for every retailer except
 * Amazon, we were never reading. This module fills that gap.
 *
 * Safety rules (so we never email a wrong concrete date):
 *   • Only DELIVERY/ARRIVAL dates are considered. Any element whose context mentions store
 *     pickup / curbside / drive-up / "ready today" is ignored — a pickup date is not a
 *     delivery date and must never drive the Wrrapd schedule.
 *   • Only month-name dates ("Jun 25", "Wednesday, June 25, 2026") and explicit
 *     today/tomorrow phrases are parsed — never bare numbers (avoids prices/quantities).
 *   • Dates must fall in a sane window (today … +60 days). Stale retailer dates are ignored
 *     so the backend falls back to generic "<retailer> delivery date + 1 day" wording.
 *   • When several delivery dates are found we keep the **latest** (Wrrapd wraps after the
 *     last item lands), matching the Amazon "latest" grouping.
 *
 * Returns a YYYY-MM-DD string (shopper-local / Eastern calendar day) or null.
 */

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7,
  sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

const DELIVERY_CUE =
  /\b(arriv\w*|delivery|delivered|deliver by|get it by|estimated (?:delivery|arrival|ship)|expected|arrives)\b/i;

const PICKUP_CUE =
  /\b(pick\s*up|pickup|curbside|drive\s*up|ready (?:for|today|within|by)|in[-\s]?store|store pickup|ship to store)\b/i;

function ymdInNy(date) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function todayNy() {
  return new Date(`${ymdInNy(new Date())}T12:00:00`);
}

/** Parse all month-name dates in a string → array of YYYY-MM-DD. */
function parseMonthNameDates(text, ref) {
  const out = [];
  const re =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?\b/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const mon = MONTHS[m[1].toLowerCase().replace(/\.$/, "")];
    if (mon == null) continue;
    const day = parseInt(m[2], 10);
    if (day < 1 || day > 31) continue;
    let year = m[3] ? parseInt(m[3], 10) : ref.getFullYear();
    if (!m[3]) {
      // No year given: choose the occurrence nearest the reference date.
      const cand = new Date(year, mon, day);
      if (cand.getTime() - ref.getTime() < -45 * 86400000) year += 1;
    }
    const d = new Date(year, mon, day);
    if (d.getMonth() !== mon || d.getDate() !== day) continue;
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  }
  return out;
}

function parseTodayTomorrow(text, ref) {
  const out = [];
  if (/\b(arriv\w*|deliver\w*|get it|expected)\b[^.]*\btoday\b/i.test(text)) {
    out.push(ymdInNy(ref));
  }
  if (/\b(arriv\w*|deliver\w*|get it|expected)\b[^.]*\btomorrow\b/i.test(text)) {
    out.push(ymdInNy(new Date(ref.getTime() + 86400000)));
  }
  return out;
}

function withinWindow(ymd, ref) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(y, m - 1, d).getTime();
  const lo = ref.getTime();
  const hi = ref.getTime() + 60 * 86400000;
  return t >= lo && t <= hi;
}

function collapseWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

/**
 * @param {object} [config]
 * @param {string[]} [config.deliveryDateSelectors] retailer-specific elements to inspect first
 * @param {Document|Element} [config.root]
 * @returns {string|null} YYYY-MM-DD or null
 */
export function captureRetailerDeliveryDate(config = {}) {
  try {
    const root = config.root || document;
    const ref = todayNy();
    const found = new Set();

    const consider = (node) => {
      if (!node) return;
      const own = collapseWhitespace(node.textContent);
      if (!own || own.length > 160) return;
      if (!DELIVERY_CUE.test(own)) return;
      if (PICKUP_CUE.test(own)) return;
      // Reject if an enclosing fulfillment block is a pickup block.
      const ctx = collapseWhitespace(node.closest?.("li,section,div,fieldset")?.textContent).slice(0, 400);
      if (PICKUP_CUE.test(ctx) && !DELIVERY_CUE.test(own.replace(PICKUP_CUE, ""))) return;
      for (const ymd of [...parseMonthNameDates(own, ref), ...parseTodayTomorrow(own, ref)]) {
        if (withinWindow(ymd, ref)) found.add(ymd);
      }
    };

    // 1) Retailer-specific hooks first (most reliable).
    for (const sel of config.deliveryDateSelectors || []) {
      root.querySelectorAll?.(sel).forEach(consider);
    }

    // 2) Generic scan of small leaf-ish elements mentioning a delivery cue.
    if (found.size === 0) {
      const scope =
        root.querySelector?.("main, [role='main'], #main, #content") || root.body || root;
      const nodes = scope.querySelectorAll?.(
        "span, p, div, li, time, strong, b, h2, h3, h4, label",
      );
      if (nodes) {
        let scanned = 0;
        for (const node of nodes) {
          // Skip containers with many children — we want leaf text near the date.
          if (node.children && node.children.length > 4) continue;
          consider(node);
          if (++scanned > 1500) break;
        }
      }
    }

    if (found.size === 0) return null;
    return [...found].sort()[found.size - 1]; // latest
  } catch {
    return null;
  }
}
