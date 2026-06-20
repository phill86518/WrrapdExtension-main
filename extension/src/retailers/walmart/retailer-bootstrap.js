import { exposeDebugGlobal } from "../../shared/store-build.js";
import {
  SHIPPING_TIER_SINGLE,
  describeTierForUi,
} from "../../content/retailer-common.js";
import { initRetailerCartGiftOptIn } from "../../shared/cart-gift-optin.js";
import { initWrrapdConflictGuard } from "../../shared/wrrapd-conflict-guard.js";
import {
  WALMART_CART_OPTIN_DATA_ATTR,
  WALMART_CART_URL_HINTS,
  WALMART_GIFT_MODAL_ID,
  WALMART_SAVED_BANNER_ATTR,
  WALMART_SESSION_PREFIX,
  WRRAPD_RETAILER_WALMART,
} from "./constants.js";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function usItemIdFromHref(href) {
  const match = String(href || "").match(/\/ip\/(?:[^/]+\/)?(\d+)/);
  return match ? match[1] : "";
}

export function extractWalmartCartSnapshot(root = document) {
  /** @type {Array<{ title: string, itemId?: string }>} */
  const items = [];
  const seen = new Set();

  for (const nameEl of root.querySelectorAll("[data-testid='productName']")) {
    const title = normalizeWhitespace(nameEl.textContent || "");
    if (!title) continue;

    const scope =
      nameEl.closest("li") ||
      nameEl.closest("[data-testid='product-tile-container']") ||
      root;

    let itemId = "";
    const idEl = scope.querySelector("[data-fs-element='usitemid']");
    if (idEl) itemId = idEl.getAttribute("data-usitemid") || "";
    if (!itemId) {
      const link = scope.querySelector("a[href*='/ip/']");
      itemId = usItemIdFromHref(link?.getAttribute("href"));
    }

    const key = itemId || title;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ title, itemId });
  }

  return { itemCount: items.length, items };
}

function isWalmartCartPage() {
  const path = location.pathname.toLowerCase();
  return WALMART_CART_URL_HINTS.some((h) => path.includes(h));
}

export function initWalmartRetailerBootstrap() {
  const shippingTierHint = describeTierForUi(SHIPPING_TIER_SINGLE);
  const cart = extractWalmartCartSnapshot(document);

  initRetailerCartGiftOptIn({
    sessionPrefix: WALMART_SESSION_PREFIX,
    retailerLabel: "Walmart",
    optInDataAttr: WALMART_CART_OPTIN_DATA_ATTR,
    savedBannerAttr: WALMART_SAVED_BANNER_ATTR,
    modalId: WALMART_GIFT_MODAL_ID,
    shippingTierHint,
    checkoutButtonPatterns: [/^continue to checkout$/i, /^checkout$/i],
    checkoutButtonSelector: "button[data-automation-id='checkout']",
    findMountAnchor: () => {
      // Top of the right-hand order rail, above the "Continue to checkout" box.
      const checkoutBtn = document.querySelector(
        "button[data-automation-id='checkout']",
      );
      if (checkoutBtn) {
        const box = checkoutBtn.closest(".shadow-1");
        if (box?.parentElement) {
          return { parent: box.parentElement, before: box };
        }
        const wrap = checkoutBtn.closest("div");
        if (wrap?.parentElement) {
          return { parent: wrap.parentElement, before: wrap };
        }
      }
      // Fallback: above Walmart's own gift checkbox / order summary.
      const summary = document.querySelector(
        "[data-testid='purchase-order-summary']",
      );
      if (summary?.parentElement) {
        return { parent: summary.parentElement, before: summary };
      }
      return null;
    },
    isCartPage: isWalmartCartPage,
    getCartSnapshot: () => extractWalmartCartSnapshot(document),
    hook: "Make it a gift — we'll wrap your Walmart order beautifully.",
    subtitle:
      "Premium gift wrap, a handwritten card, and optional flowers — wrapped by Wrrapd and shipped to your giftee.",
    modalIntro:
      "Add a gift message per item. You'll complete Wrrapd's secure payment during checkout, then we wrap and ship to your giftee.",
  });

  initWrrapdConflictGuard({
    sessionPrefix: WALMART_SESSION_PREFIX,
    retailerLabel: "Walmart",
    savedBannerAttr: WALMART_SAVED_BANNER_ATTR,
  });

  exposeDebugGlobal("__WRRAPD_WALMART_DEBUG__", {
    retailer: WRRAPD_RETAILER_WALMART,
    href: window.location.href,
    shippingTier: SHIPPING_TIER_SINGLE,
    shippingTierHint,
    cart,
    isCart: isWalmartCartPage(),
    sampledAt: new Date().toISOString(),
  });
}
