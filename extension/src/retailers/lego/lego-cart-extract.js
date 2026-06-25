import { LEGO_ITEM_CHOICES_KEY } from "./constants.js";
import {
  buildCartFingerprint,
  defaultEmptyChoice,
  readCartFingerprint,
  syncGiftSessionWithCart,
  writeCartFingerprint,
} from "../../shared/cart-gift-sync.js";
import {
  readGiftChoicesSaved,
  readGiftLegalTermsAccepted,
  readLegoItemChoices,
  writeGiftChoicesSaved,
  writeGiftLegalTermsAccepted,
  writeLegoItemChoices,
  writeLegoPaymentSuccess,
} from "./lego-session-state.js";
import { isExcludedScrapeRegion } from "../../shared/cart-scrape-region.js";

const LEGO_SYNC_PREFIX = "wrrapdLego";

const LEGO_CART_SNAPSHOT_KEY = "wrrapdLegoCartSnapshot";

/**
 * LEGO product URLs are typically:
 * https://www.lego.com/.../product/product-name-NNNNN
 * The numeric set ID at the end of the slug is the SKU.
 */
const PRODUCT_SLUG_SKU = /\/product\/[^/]+-(\d{4,6})(?:\/|[?#]|$)/i;

const LEGO_CART_LINE_ROOT_SELECTOR = [
  "[data-test*='cart' i]",
  "[data-test*='bag' i]",
  "[data-testid*='cart' i]",
  "[data-testid*='bag' i]",
  "[aria-label*='cart' i]",
  "[aria-label*='bag' i]",
  "[class*='Cart' i]",
  "[class*='Bag' i]",
  "[class*='Basket' i]",
  "[id*='cart' i]",
  "[id*='bag' i]",
].join(",");

function closestLegoCartLineRoot(el) {
  let node = el?.closest?.(LEGO_CART_LINE_ROOT_SELECTOR) || null;
  while (node) {
    if (!isExcludedScrapeRegion(node) && node.querySelector?.('a[href*="/product/"]')) {
      return node;
    }
    node = node.parentElement?.closest?.(LEGO_CART_LINE_ROOT_SELECTOR) || null;
  }
  return null;
}

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
    if (isExcludedScrapeRegion(a)) continue;
    const cartRoot = closestLegoCartLineRoot(a);
    if (!cartRoot) continue;
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
    const card = a.closest("article, [data-test*='cart' i], li, tr, [class*='ProductCard' i]") || cartRoot;
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

export function getLegoCartSnapshotFromDocument() {
  const lines = extractLegoCartProductLines();
  return {
    itemCount: lines.length,
    items: lines.map((line) => ({
      title: line.title,
      itemId: line.sku || line.id,
      sku: line.sku,
      id: line.id,
    })),
  };
}

function legoGiftSessionAdapter() {
  return {
    prefix: LEGO_SYNC_PREFIX,
    readChoices: readLegoItemChoices,
    writeChoices: writeLegoItemChoices,
    readFingerprint: () => readCartFingerprint(LEGO_SYNC_PREFIX),
    writeFingerprint: (fp) => writeCartFingerprint(LEGO_SYNC_PREFIX, fp),
    clearPayment: () => writeLegoPaymentSuccess(false),
    invalidateSaved: () => {
      writeGiftChoicesSaved(false);
      writeGiftLegalTermsAccepted(false);
    },
    readWasComplete: () => readGiftChoicesSaved() && readGiftLegalTermsAccepted(),
  };
}

/** Keep LEGO per-item gift choices aligned when bag lines change. */
export function syncLegoCartGiftState() {
  snapshotLegoCartToSession();
  return syncGiftSessionWithCart(legoGiftSessionAdapter(), getLegoCartSnapshotFromDocument(), defaultEmptyChoice);
}

export { buildCartFingerprint as buildLegoCartFingerprint };
