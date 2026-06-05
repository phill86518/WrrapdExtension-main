import {
  SHIPPING_TIER_SINGLE,
  describeTierForUi,
} from "../../content/retailer-common.js";
import { initRetailerCartGiftOptIn } from "../../shared/cart-gift-optin.js";
import {
  ETSY_CART_OPTIN_DATA_ATTR,
  ETSY_CART_URL_HINTS,
  ETSY_GIFT_MODAL_ID,
  ETSY_SAVED_BANNER_ATTR,
  ETSY_SESSION_PREFIX,
  WRRAPD_RETAILER_ETSY,
} from "./constants.js";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function listingIdFromHref(href) {
  const match = String(href || "").match(/\/listing\/(\d+)/);
  return match ? match[1] : "";
}

function extractEtsyCartSnapshot(root = document) {
  /** @type {Array<{ title: string, itemId?: string }>} */
  const items = [];
  const seen = new Set();

  for (const li of root.querySelectorAll("li[data-cart-listing]")) {
    let title = normalizeWhitespace(li.getAttribute("data-listing-title") || "");
    if (!title) {
      const titleLink = li.querySelector("a[data-listing-title], [data-title]");
      title = normalizeWhitespace(
        titleLink?.getAttribute("data-title") || titleLink?.textContent || "",
      );
    }
    if (!title) continue;

    let itemId = li.getAttribute("data-listing-id") || "";
    if (!itemId) {
      const link = li.querySelector("a[href*='/listing/']");
      itemId = listingIdFromHref(link?.getAttribute("href"));
    }

    const key = itemId || title;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ title, itemId });
  }

  return { itemCount: items.length, items };
}

function isEtsyCartPage() {
  const path = location.pathname.toLowerCase();
  return ETSY_CART_URL_HINTS.some((h) => path.includes(h));
}

export function initEtsyRetailerBootstrap() {
  const shippingTierHint = describeTierForUi(SHIPPING_TIER_SINGLE);
  const cart = extractEtsyCartSnapshot(document);

  initRetailerCartGiftOptIn({
    sessionPrefix: ETSY_SESSION_PREFIX,
    retailerLabel: "Etsy",
    optInDataAttr: ETSY_CART_OPTIN_DATA_ATTR,
    savedBannerAttr: ETSY_SAVED_BANNER_ATTR,
    modalId: ETSY_GIFT_MODAL_ID,
    shippingTierHint,
    checkoutButtonPatterns: [/^proceed to checkout$/i, /^place your order/i],
    findMountAnchor: () => {
      // Top of the right-hand payment rail, above "How you'll pay".
      const form = document.querySelector("form.enter-checkout-form");
      if (form) {
        const section = form.querySelector(".cart-payment-section");
        if (section) return { parent: form, before: section };
        return { parent: form, before: form.firstElementChild };
      }
      // Fallback: inside the payment box wrapper.
      const box = document.querySelector(".multi-shop-cart-payment");
      if (box) return { parent: box, before: box.firstElementChild };
      // Fallback: above the "Proceed to checkout" button.
      const checkoutBtn = document.querySelector(
        ".proceed-to-checkout, [data-selector='cart-submit-button']",
      );
      if (checkoutBtn?.parentElement) {
        return { parent: checkoutBtn.parentElement, before: checkoutBtn };
      }
      return null;
    },
    isCartPage: isEtsyCartPage,
    getCartSnapshot: () => extractEtsyCartSnapshot(document),
    hook: "Make it a gift — we'll wrap your Etsy order beautifully.",
    subtitle:
      "Premium gift wrap, a handwritten card, and optional flowers — wrapped by Wrrapd and shipped to your giftee. This is separate from Etsy's own \u201cMark order as a gift\u201d option.",
    modalIntro:
      "Add a gift message per item. You'll complete Wrrapd's secure payment during checkout, then we wrap and ship to your giftee.",
  });

  window.__WRRAPD_ETSY_DEBUG__ = {
    retailer: WRRAPD_RETAILER_ETSY,
    href: window.location.href,
    shippingTier: SHIPPING_TIER_SINGLE,
    shippingTierHint,
    cart,
    isCart: isEtsyCartPage(),
    sampledAt: new Date().toISOString(),
  };
}
