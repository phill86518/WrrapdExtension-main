import {
  SHIPPING_TIER_SINGLE,
  describeTierForUi,
} from "../../content/retailer-common.js";
import { initRetailerCartGiftOptIn } from "../../shared/cart-gift-optin.js";
import {
  NORDSTROM_CART_OPTIN_DATA_ATTR,
  NORDSTROM_CART_URL_HINTS,
  NORDSTROM_GIFT_MODAL_ID,
  NORDSTROM_SAVED_BANNER_ATTR,
  NORDSTROM_SESSION_PREFIX,
  WRRAPD_RETAILER_NORDSTROM,
} from "./constants.js";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function styleIdFromHref(href) {
  // Nordstrom product links look like /s/<slug>/<id> or /s/<id>
  const match = String(href || "").match(/\/s\/(?:[^/?#]+\/)?(\d+)/);
  return match ? match[1] : "";
}

function extractNordstromCartSnapshot(root = document) {
  /** @type {Array<{ title: string, itemId?: string }>} */
  const items = [];
  const seen = new Set();

  for (const li of root.querySelectorAll("#shopping-bag-item")) {
    const brand = normalizeWhitespace(li.querySelector(".RQS4N")?.textContent || "");

    let name = "";
    const nameEl = li.querySelector(".RQS4N + div");
    if (nameEl) name = normalizeWhitespace(nameEl.textContent || "");
    if (!name) {
      const img = li.querySelector("img[alt]");
      name = normalizeWhitespace(img?.getAttribute("alt") || "");
    }

    const title =
      normalizeWhitespace([brand, name].filter(Boolean).join(" ")) ||
      name ||
      brand;
    if (!title) continue;

    let itemId = "";
    const link = li.querySelector("a[href*='/s/']");
    itemId = styleIdFromHref(link?.getAttribute("href"));
    if (!itemId) {
      for (const d of li.querySelectorAll(".v0B0y div")) {
        const im = normalizeWhitespace(d.textContent || "").match(/^Item:\s*(\d+)/i);
        if (im) {
          itemId = im[1];
          break;
        }
      }
    }

    const key = itemId || title;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ title, itemId });
  }

  return { itemCount: items.length, items };
}

function isNordstromCartPage() {
  const path = location.pathname.toLowerCase();
  return NORDSTROM_CART_URL_HINTS.some((h) => path.includes(h));
}

export function initNordstromRetailerBootstrap() {
  const shippingTierHint = describeTierForUi(SHIPPING_TIER_SINGLE);
  const cart = extractNordstromCartSnapshot(document);

  initRetailerCartGiftOptIn({
    sessionPrefix: NORDSTROM_SESSION_PREFIX,
    retailerLabel: "Nordstrom",
    optInDataAttr: NORDSTROM_CART_OPTIN_DATA_ATTR,
    savedBannerAttr: NORDSTROM_SAVED_BANNER_ATTR,
    modalId: NORDSTROM_GIFT_MODAL_ID,
    shippingTierHint,
    checkoutButtonPatterns: [/^check ?out$/i, /^place order$/i],
    findMountAnchor: () => {
      // Right-hand order summary rail; place above the "Check Out" button.
      const checkoutBtn = document.querySelector("a[href='/checkout']");
      if (checkoutBtn) {
        const block = checkoutBtn.closest("div");
        if (block?.parentElement) {
          return { parent: block.parentElement, before: block };
        }
      }
      // Fallback: top of the order-summary section.
      const summary = document.querySelector("section.oWrEX");
      if (summary) {
        return { parent: summary, before: summary.firstElementChild };
      }
      return null;
    },
    isCartPage: isNordstromCartPage,
    getCartSnapshot: () => extractNordstromCartSnapshot(document),
    hook: "Make it a gift — we'll wrap your Nordstrom order beautifully.",
    subtitle:
      "Premium gift wrap, a handwritten card, and optional flowers — wrapped by Wrrapd and shipped to your giftee.",
    modalIntro:
      "Add a gift message per item. You'll complete Wrrapd's secure payment during checkout, then we wrap and ship to your giftee.",
  });

  window.__WRRAPD_NORDSTROM_DEBUG__ = {
    retailer: WRRAPD_RETAILER_NORDSTROM,
    href: window.location.href,
    shippingTier: SHIPPING_TIER_SINGLE,
    shippingTierHint,
    cart,
    isCart: isNordstromCartPage(),
    sampledAt: new Date().toISOString(),
  };
}
