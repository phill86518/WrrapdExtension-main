import {
  SHIPPING_TIER_SINGLE,
  describeTierForUi,
} from "../../content/retailer-common.js";
import { initRetailerCartGiftOptIn } from "../../shared/cart-gift-optin.js";
import {
  SEPHORA_BASKET_URL_HINTS,
  SEPHORA_CART_OPTIN_DATA_ATTR,
  SEPHORA_CHECKOUT_URL_HINTS,
  SEPHORA_GIFT_MODAL_ID,
  SEPHORA_SAVED_BANNER_ATTR,
  SEPHORA_SESSION_PREFIX,
  WRRAPD_RETAILER_SEPHORA,
} from "./constants.js";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractSephoraCartSnapshot(root = document) {
  /** @type {Array<{ title: string }>} */
  const items = [];
  const seen = new Set();

  for (const img of root.querySelectorAll('[data-at="item_picture"] img, img[alt]')) {
    const title = normalizeWhitespace(img.getAttribute("alt") || "");
    if (!title || title.length < 3 || seen.has(title)) continue;
    seen.add(title);
    items.push({ title });
  }

  for (const link of root.querySelectorAll('a[href*="/product/"], a[href*="/p/"]')) {
    const title = normalizeWhitespace(link.textContent || link.getAttribute("title") || "");
    if (!title || title.length < 3 || seen.has(title)) continue;
    seen.add(title);
    items.push({ title });
  }

  for (const node of root.querySelectorAll('[data-comp*="BasketItem"], [data-comp*="ProductCard"]')) {
    const title = normalizeWhitespace(
      node.querySelector("a, h2, h3, [data-at*='product']")?.textContent || "",
    );
    if (!title || title.length < 3 || seen.has(title)) continue;
    seen.add(title);
    items.push({ title });
  }

  return { itemCount: items.length, items };
}

function isSephoraBasketPage() {
  const path = location.pathname.toLowerCase();
  return SEPHORA_BASKET_URL_HINTS.some((h) => path.includes(h));
}

function isSephoraCheckoutPage() {
  const path = location.pathname.toLowerCase();
  return SEPHORA_CHECKOUT_URL_HINTS.some((h) => path.includes(h));
}

export function initSephoraRetailerBootstrap() {
  const shippingTierHint = describeTierForUi(SHIPPING_TIER_SINGLE);
  const cart = extractSephoraCartSnapshot(document);

  initRetailerCartGiftOptIn({
    sessionPrefix: SEPHORA_SESSION_PREFIX,
    retailerLabel: "Sephora",
    optInDataAttr: SEPHORA_CART_OPTIN_DATA_ATTR,
    savedBannerAttr: SEPHORA_SAVED_BANNER_ATTR,
    modalId: SEPHORA_GIFT_MODAL_ID,
    shippingTierHint,
    checkoutButtonPatterns: [/^checkout$/i, /^place order$/i],
    findMountAnchor: () => {
      if (isSephoraCheckoutPage()) {
        const deliver =
          document.querySelector("#Deliver_To")?.closest("[role='region']") ||
          document.querySelector('[data-comp*="DeliverTo"]');
        if (deliver?.parentElement) {
          return { parent: deliver.parentElement, before: deliver };
        }
      }
      const checkoutBtn = [...document.querySelectorAll("button")].find((b) =>
        /^checkout$/i.test(normalizeWhitespace(b.textContent || "")),
      );
      if (checkoutBtn?.parentElement) {
        return { parent: checkoutBtn.parentElement, before: checkoutBtn };
      }
      const summary = document.querySelector('[data-comp*="CostSummary"], [data-at="total_label"]')?.closest("[role='region']");
      if (summary?.parentElement) {
        return { parent: summary.parentElement, before: summary };
      }
      return null;
    },
    isCartPage: isSephoraBasketPage,
    isCheckoutPage: isSephoraCheckoutPage,
    getCartSnapshot: () => extractSephoraCartSnapshot(document),
    modalIntro:
      "Sephora gift wrap through Wrrapd is separate from Sephora's own gift message. Save your choices here, then continue checkout.",
  });

  window.__WRRAPD_SEPHORA_DEBUG__ = {
    retailer: WRRAPD_RETAILER_SEPHORA,
    href: window.location.href,
    shippingTier: SHIPPING_TIER_SINGLE,
    shippingTierHint,
    cart,
    isBasket: isSephoraBasketPage(),
    isCheckout: isSephoraCheckoutPage(),
    sampledAt: new Date().toISOString(),
  };
}
