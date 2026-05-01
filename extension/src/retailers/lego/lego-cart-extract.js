import { LEGO_ITEM_CHOICES_KEY } from "./constants.js";

const LEGO_CART_SNAPSHOT_KEY = "wrrapdLegoCartSnapshot";

/**
 * LEGO product URLs are typically:
 * https://www.lego.com/.../product/product-name-NNNNN
 * The numeric set ID at the end of the slug is the SKU.
 */
const PRODUCT_SLUG_SKU = /\/product\/[^/]+-(\d{4,6})(?:\/|[?#]|$)/i;

/**
 * @returns {Array<{ id: string, sku: string, title: string, productUrl: string, imageUrl: string }>}
 */
export function extractLegoCartProductLines() {
  const root =
    document.getElementById("main-content") ||
    document.querySelector("main[role='main']") ||
    document.querySelector("main") ||
    document.body;
  const links = root.querySelectorAll('a[href*="/product/"]');
  const out = [];
  const seen = new Set();
  for (const a of links) {
    const hrefRaw = a.href || a.getAttribute("href") || "";
    const href = String(hrefRaw).split("#")[0].split("?")[0];
    const m = href.match(PRODUCT_SLUG_SKU);
    const sku = m ? m[1] : "";
    if (!sku) continue;
    if (seen.has(sku)) continue;
    seen.add(sku);
    const rawTitle = (a.textContent || "").replace(/\s+/g, " ").trim() ||
      a.getAttribute("aria-label") ||
      `LEGO #${sku}`;
    const title = rawTitle.length > 100 ? rawTitle.slice(0, 100) + "…" : rawTitle;
    let imageUrl = "";
    const card = a.closest("article, [data-test*='cart' i], li, tr, [class*='ProductCard' i]") || a.parentElement;
    if (card) {
      const im = card.querySelector("img[src]");
      if (im) imageUrl = im.getAttribute("src") || "";
    }
    out.push({ id: sku, sku, title, productUrl: href, imageUrl });
  }
  return out;
}

export function snapshotLegoCartToSession() {
  const lines = extractLegoCartProductLines();
  try {
    if (lines.length) {
      sessionStorage.setItem(LEGO_CART_SNAPSHOT_KEY, JSON.stringify(lines));
    }
  } catch { /* ignore */ }
  return lines;
}

export function readLegoCartSnapshot() {
  try {
    const raw = sessionStorage.getItem(LEGO_CART_SNAPSHOT_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}
