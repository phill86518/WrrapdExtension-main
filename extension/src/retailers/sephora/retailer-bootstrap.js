import { exposeDebugGlobal } from "../../shared/store-build.js";
import {
  SHIPPING_TIER_SINGLE,
  describeTierForUi,
} from "../../content/retailer-common.js";
import { initRetailerCartGiftOptIn } from "../../shared/cart-gift-optin.js";
import { initWrrapdConflictGuard } from "../../shared/wrrapd-conflict-guard.js";
import { isExcludedScrapeRegion } from "../../shared/cart-scrape-region.js";
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

export function extractSephoraCartSnapshot(root = document) {
  /** @type {Array<{ title: string, brand?: string, itemId?: string }>} */
  const items = [];
  const seen = new Set();

  // Primary: Sephora basket line items expose stable data-at hooks.
  const lineItems = root.querySelectorAll(
    '[data-at="product_refinement"], [data-comp*="BasicSkuItem"]',
  );
  for (const node of lineItems) {
    if (isExcludedScrapeRegion(node)) continue;
    const brand = normalizeWhitespace(node.querySelector('[data-at="bsk_sku_brand"]')?.textContent || "");
    const name = normalizeWhitespace(node.querySelector('[data-at="bsk_sku_name"]')?.textContent || "");
    const sizeText = normalizeWhitespace(node.querySelector('[data-at="sku_size"]')?.textContent || "");
    const itemMatch = sizeText.match(/ITEM\s+(\d+)/i);
    const title = [brand, name].filter(Boolean).join(" ").trim() || name || brand;
    if (!title || seen.has(title)) continue;
    seen.add(title);
    items.push({ title, brand, itemId: itemMatch ? itemMatch[1] : "" });
  }

  if (items.length > 0) return { itemCount: items.length, items };

  // Fallback for checkout/other layouts: product image alt text.
  for (const img of root.querySelectorAll('[data-at="item_picture"] img')) {
    if (isExcludedScrapeRegion(img)) continue;
    const title = normalizeWhitespace(img.getAttribute("alt") || "");
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
      // Basket: place above the real Checkout button (data-at hook).
      const checkoutBtn = document.querySelector('[data-at="basket_checkout_btn"]');
      if (checkoutBtn?.parentElement) {
        return { parent: checkoutBtn.parentElement, before: checkoutBtn };
      }
      if (isSephoraCheckoutPage()) {
        const deliver =
          document.querySelector("#Deliver_To")?.closest("[role='region']") ||
          document.querySelector('[data-comp*="DeliverTo"]');
        if (deliver?.parentElement) {
          return { parent: deliver.parentElement, before: deliver };
        }
        const placeOrder = document.querySelector('[data-at="place_order_btn"]');
        if (placeOrder?.parentElement) {
          return { parent: placeOrder.parentElement, before: placeOrder };
        }
      }
      const summary = document
        .querySelector('[data-at="order_summary"], [data-comp*="CostSummary"]')
        ?.closest("[role='region']");
      if (summary?.parentElement) {
        return { parent: summary.parentElement, before: summary };
      }
      return null;
    },
    isCartPage: isSephoraBasketPage,
    isCheckoutPage: isSephoraCheckoutPage,
    getCartSnapshot: () => extractSephoraCartSnapshot(document),
    hook: "Make it a gift — we'll wrap your Sephora order beautifully.",
    subtitle:
      "Premium gift wrap, a handwritten card, and optional flowers — wrapped by Wrrapd and shipped to your giftee.",
    modalIntro:
      "Add a gift message per item. You'll complete Wrrapd's secure payment during checkout, then we wrap and ship to your giftee.",
  });

  initWrrapdConflictGuard({
    sessionPrefix: SEPHORA_SESSION_PREFIX,
    retailerLabel: "Sephora",
    savedBannerAttr: SEPHORA_SAVED_BANNER_ATTR,
  });

  exposeDebugGlobal("__WRRAPD_SEPHORA_DEBUG__", {
    retailer: WRRAPD_RETAILER_SEPHORA,
    href: window.location.href,
    shippingTier: SHIPPING_TIER_SINGLE,
    shippingTierHint,
    cart,
    isBasket: isSephoraBasketPage(),
    isCheckout: isSephoraCheckoutPage(),
    sampledAt: new Date().toISOString(),
  });
}
