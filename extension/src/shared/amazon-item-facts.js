/**
 * Read package and product dimensions from an Amazon product page.
 * Checkout stays on the cart; this runs in the background from the shopper's Amazon session.
 */

const STORAGE_KEY = "wrrapd-items";

function emptyFacts() {
  return { packageDimensions: "", productDimensions: "", category: "" };
}

export function parseAmazonItemFacts(html) {
  const source = String(html || "");
  const text = source
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/&lrm;|&#8206;|&nbsp;|&#160;/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  function grab(label) {
    const re = new RegExp(
      `${label}\\s*:?\\s*(\\d+(?:\\.\\d+)?\\s*(?:x|×)\\s*\\d+(?:\\.\\d+)?\\s*(?:x|×)\\s*\\d+(?:\\.\\d+)?(?:\\s*(?:inches|inch|in|cm|mm))?)`,
      "i",
    );
    const match = text.match(re);
    return match ? match[1].replace(/\s+/g, " ").replace(/×/g, "x").trim() : "";
  }

  const packageDimensions =
    grab("Package Dimensions") || grab("Item Package Dimensions(?:\\s*L\\s*x\\s*W\\s*x\\s*H)?");
  const productDimensions =
    grab("Product Dimensions") || grab("Item Dimensions(?:\\s*L\\s*x\\s*W\\s*x\\s*H)?");

  let category = "";
  const crumb = source.match(/id=["']wayfinding-breadcrumbs_feature_div["'][\s\S]{0,3000}/i);
  if (crumb) {
    const links = [...crumb[0].matchAll(/>([^<]{2,80})</g)]
      .map((m) => m[1].replace(/\s+/g, " ").trim())
      .filter((part) => part && part !== "›" && part !== ">" && !/^back to/i.test(part));
    category = links[0] || "";
  }

  return { packageDimensions, productDimensions, category };
}

export async function fetchAmazonItemFacts(asin) {
  const id = String(asin || "").trim();
  if (!/^[A-Z0-9]{10}$/i.test(id)) return emptyFacts();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`https://www.amazon.com/dp/${encodeURIComponent(id)}`, {
      credentials: "include",
      signal: ctrl.signal,
      headers: { Accept: "text/html" },
    });
    if (!res.ok) return emptyFacts();
    return parseAmazonItemFacts(await res.text());
  } catch {
    return emptyFacts();
  } finally {
    clearTimeout(timer);
  }
}

let inflight = null;

/** Fill package dimensions onto cart rows saved in localStorage. Safe to call more than once. */
export function enrichStoredAmazonItemFacts() {
  if (inflight) return inflight;
  inflight = runEnrich().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function runEnrich() {
  let parsed;
  try {
    parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== "object") return;
  const rows = Array.isArray(parsed) ? parsed : Object.values(parsed);
  const now = Date.now();
  const pending = rows.filter((row) => {
    if (!row || !row.asin) return false;
    if (row.packageDimensions || row.productDimensions) return false;
    const looked = Date.parse(row.dimensionLookupAt || "");
    return !Number.isFinite(looked) || now - looked > 60_000;
  });
  await Promise.all(
    pending.slice(0, 8).map(async (row) => {
      const facts = await fetchAmazonItemFacts(row.asin);
      row.packageDimensions = facts.packageDimensions || "";
      row.productDimensions = facts.productDimensions || "";
      row.itemCategory = facts.category || row.itemCategory || "";
      row.dimensionLookupAt = new Date().toISOString();
    }),
  );
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore quota */
  }
}
