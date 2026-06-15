import {
  SHIPPING_TIER_SINGLE,
  describeTierForUi,
} from "../../content/retailer-common.js";
import { initRetailerCartGiftOptIn } from "../../shared/cart-gift-optin.js";
import {
  ULTA_CART_OPTIN_DATA_ATTR,
  ULTA_CART_URL_HINTS,
  ULTA_GIFT_MODAL_ID,
  ULTA_SAVED_BANNER_ATTR,
  ULTA_SESSION_PREFIX,
  WRRAPD_RETAILER_ULTA,
} from "./constants.js";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

/** True when the Ulta bag page has no purchasable line items (not recommendations). */
export function isUltaBagEmpty(root = document) {
  const bagHeader = root.querySelector(".BagHeader");
  const headerText = normalizeWhitespace(bagHeader?.textContent || "");
  if (/your bag is empty/i.test(headerText)) return true;
  if (/^bag\s*0 items?$/i.test(headerText.replace(/\s+/g, " "))) return true;

  const bagItems = root.querySelector(".BagItemsSplit");
  if (bagItems && !bagItems.querySelector(".DeliveryGroup__item .BagProductCardSplit, .BagProductCardSplit")) {
    return true;
  }

  return false;
}

export function extractUltaCartSnapshot(root = document) {
  if (isUltaBagEmpty(root)) {
    return { itemCount: 0, items: [], isEmpty: true };
  }

  /** @type {Array<{ title: string, brand?: string, itemId?: string }>} */
  const items = [];
  const seen = new Set();

  const bagRoot =
    root.querySelector(".BagItemsSplit") ||
    root.querySelector(".DeliveryGroup__itemList") ||
    root;

  for (const card of bagRoot.querySelectorAll(".DeliveryGroup__item .BagProductCardSplit, .BagProductCardSplit")) {
    if (!card.closest(".BagItemsSplit, .DeliveryGroup__itemList, .BagSection")) continue;

    const detail = card.querySelector(".BagProductCardDetails__ProductDetails");
    const brand = normalizeWhitespace(detail?.querySelector("span.Text-ds")?.textContent || "");
    const name = normalizeWhitespace(detail?.querySelector("h3")?.textContent || "");

    let itemId = "";
    const link = card.querySelector("a[href*='sku=']");
    if (link) {
      const match = (link.getAttribute("href") || "").match(/sku=(\d+)/);
      if (match) itemId = match[1];
    }

    const title = name || brand;
    if (!title || seen.has(title)) continue;
    seen.add(title);
    items.push({ title, brand, itemId });
  }

  return { itemCount: items.length, items, isEmpty: items.length === 0 };
}

function isUltaCartPage() {
  const path = location.pathname.toLowerCase();
  return ULTA_CART_URL_HINTS.some((h) => path.includes(h));
}

export function initUltaRetailerBootstrap() {
  const shippingTierHint = describeTierForUi(SHIPPING_TIER_SINGLE);
  const cart = extractUltaCartSnapshot(document);

  initRetailerCartGiftOptIn({
    sessionPrefix: ULTA_SESSION_PREFIX,
    retailerLabel: "Ulta",
    optInDataAttr: ULTA_CART_OPTIN_DATA_ATTR,
    savedBannerAttr: ULTA_SAVED_BANNER_ATTR,
    modalId: ULTA_GIFT_MODAL_ID,
    shippingTierHint,
    checkoutButtonPatterns: [/^checkout$/i, /^place order$/i],
    findMountAnchor: () => {
      // Place above the real Checkout button (sticky cart actions).
      const checkoutBtn =
        document.querySelector(".CartActions__CheckoutButton") ||
        document.querySelector(".CartActions button");
      if (checkoutBtn) {
        const actions = checkoutBtn.closest(".CartActions");
        if (actions?.parentElement) {
          return { parent: actions.parentElement, before: actions };
        }
        if (checkoutBtn.parentElement) {
          return { parent: checkoutBtn.parentElement, before: checkoutBtn };
        }
      }
      // Next best: above Ulta's own gifting module.
      const gifting = document.querySelector(".GiftingV2");
      if (gifting?.parentElement) {
        return { parent: gifting.parentElement, before: gifting };
      }
      // Fallback: above the order summary.
      const summary = document.querySelector(".OrderSummary");
      if (summary?.parentElement) {
        return { parent: summary.parentElement, before: summary };
      }
      return null;
    },
    isCartPage: isUltaCartPage,
    isCartEmpty: () => isUltaBagEmpty(document),
    getCartSnapshot: () => extractUltaCartSnapshot(document),
    hook: "Make it a gift — we'll wrap your Ulta order beautifully.",
    subtitle:
      "Premium gift wrap, a handwritten card, and optional flowers — wrapped by Wrrapd and shipped to your giftee.",
    modalIntro:
      "Add a gift message per item. You'll complete Wrrapd's secure payment during checkout, then we wrap and ship to your giftee.",
  });

  window.__WRRAPD_ULTA_DEBUG__ = {
    retailer: WRRAPD_RETAILER_ULTA,
    href: window.location.href,
    shippingTier: SHIPPING_TIER_SINGLE,
    shippingTierHint,
    cart,
    isCart: isUltaCartPage(),
    sampledAt: new Date().toISOString(),
  };
}
