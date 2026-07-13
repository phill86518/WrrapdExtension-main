import { exposeDebugGlobal } from "../../shared/store-build.js";
import {
  SHIPPING_TIER_SINGLE,
  describeTierForUi,
} from "../../content/retailer-common.js";
import { initRetailerCartGiftOptIn } from "../../shared/cart-gift-optin.js";
import { initWrrapdConflictGuard } from "../../shared/wrrapd-conflict-guard.js";
import { isExcludedScrapeRegion } from "../../shared/cart-scrape-region.js";
import { detectItemFulfillment } from "../../shared/cart-fulfillment.js";
import {
  TARGET_CART_OPTIN_DATA_ATTR,
  TARGET_CART_URL_HINTS,
  TARGET_GIFT_MODAL_ID,
  TARGET_SAVED_BANNER_ATTR,
  TARGET_SESSION_PREFIX,
  WRRAPD_RETAILER_TARGET,
} from "./constants.js";
import { findTargetWrrapdMountAnchor } from "./target-layout.js";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseMoney(value) {
  const text = normalizeWhitespace(value);
  const match = text.match(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function getTextBySelectors(selectors, root = document) {
  for (const selector of selectors) {
    const node = root.querySelector(selector);
    const text = normalizeWhitespace(node?.textContent || "");
    if (text) return text;
  }
  return "";
}

function tcinFromHref(href) {
  const match = String(href || "").match(/\/A-(\d+)/i);
  return match ? match[1] : "";
}

function extractTargetItems(root = document) {
  const itemNodes = Array.from(root.querySelectorAll('[data-test="cartItem"]'));
  return itemNodes
    .map((node) => {
      if (isExcludedScrapeRegion(node)) return null;
      const title =
        getTextBySelectors(
          [
            '[data-test="cartItem-title"]',
            '[data-test="cartItem-link"]',
            "h3",
            "a[href*='/p/']",
          ],
          node,
        ) || "";
      if (!title) return null;

      const link = node.querySelector("a[href*='/p/']");
      const itemId = tcinFromHref(link?.getAttribute("href"));
      const priceText = getTextBySelectors(
        [
          '[data-test="cartItem-price"]',
          '[data-test="current-price"]',
          '[data-test="offerPrice"]',
        ],
        node,
      );

      return {
        title,
        itemId,
        priceText,
        unitPrice: parseMoney(priceText),
        quantity: 1,
        fulfillment: detectItemFulfillment(node),
      };
    })
    .filter(Boolean);
}

function extractSummaryAmount(labelMatcher, root = document) {
  const summary =
    root.querySelector('[data-test="orderSummary"]') ||
    root.querySelector('[data-test="cart-summary"]');
  if (!summary) return null;
  const scope = summary;
  const rows = Array.from(scope.querySelectorAll("div, li, span, p"));
  for (const row of rows) {
    const text = normalizeWhitespace(row.textContent || "");
    if (!text || !labelMatcher.test(text)) continue;
    const amount = parseMoney(text);
    if (amount !== null) return amount;
  }
  return null;
}

export function extractTargetCartSnapshot(root = document) {
  const items = extractTargetItems(root);
  const subtotal = extractSummaryAmount(/\bsubtotal\b/i, root);
  const orderTotal = extractSummaryAmount(/\b(estimated total|total)\b/i, root);

  return {
    itemCount: items.length,
    items,
    subtotal,
    orderTotal,
  };
}

export function initTargetRetailerBootstrap() {
  const shippingTierHint = describeTierForUi(SHIPPING_TIER_SINGLE);
  const cart = extractTargetCartSnapshot(document);

  initRetailerCartGiftOptIn({
    sessionPrefix: TARGET_SESSION_PREFIX,
    retailerLabel: "Target",
    optInDataAttr: TARGET_CART_OPTIN_DATA_ATTR,
    savedBannerAttr: TARGET_SAVED_BANNER_ATTR,
    modalId: TARGET_GIFT_MODAL_ID,
    shippingTierHint,
    checkoutButtonPatterns: [/^check out$/i, /^checkout$/i, /^proceed to checkout$/i],
    checkoutButtonSelector: '[data-test="checkout-button"]',
    summarySelector: '[data-test="orderSummary"]',
    findMountAnchor: findTargetWrrapdMountAnchor,
    isCartPage: () => TARGET_CART_URL_HINTS.some((h) => location.pathname.toLowerCase().includes(h)),
    getCartSnapshot: () => extractTargetCartSnapshot(document),
  });

  initWrrapdConflictGuard({
    sessionPrefix: TARGET_SESSION_PREFIX,
    retailerLabel: "Target",
    savedBannerAttr: TARGET_SAVED_BANNER_ATTR,
    hideSelectors: [
      '[data-test="InStoreFulfillment"]',
      '[data-test="sameDayDeliveryRadioInput"]',
      '[data-test="changeStoreLink"]',
      // Cart-level "Order Pickup / Ready tomorrow" chrome while Wrrapd is on
      // (shipping radio click re-groups the cart; until then hide pickup chrome).
      '[data-test="fulfillment-icon"]',
      '[data-test="grouped-cart-fulfillment-heading"]',
      '[data-test="pickupStoreName"]',
    ],
    preferShippingSelectors: [
      '[data-test="ShippingFulfillment"] input[type="radio"]',
      'input[type="radio"][value="STANDARD"]',
      'input[type="radio"][id*="-shipping"]',
    ],
  });

  exposeDebugGlobal("__WRRAPD_TARGET_DEBUG__", {
    retailer: WRRAPD_RETAILER_TARGET,
    href: window.location.href,
    shippingTier: SHIPPING_TIER_SINGLE,
    shippingTierHint,
    cart,
    sampledAt: new Date().toISOString(),
  });
}
