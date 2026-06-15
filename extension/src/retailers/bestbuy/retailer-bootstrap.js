import {
  SHIPPING_TIER_BESTBUY_LIMITED,
  describeTierForUi,
} from "../../content/retailer-common.js";
import { initRetailerCartGiftOptIn } from "../../shared/cart-gift-optin.js";
import {
  BESTBUY_CART_OPTIN_DATA_ATTR,
  BESTBUY_CART_URL_HINTS,
  BESTBUY_GIFT_MODAL_ID,
  BESTBUY_SAVED_BANNER_ATTR,
  BESTBUY_SESSION_PREFIX,
  WRRAPD_RETAILER_BESTBUY,
} from "./constants.js";

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

function detectFulfillmentType(itemRoot) {
  const text = normalizeWhitespace(itemRoot?.textContent || "").toLowerCase();
  if (!text) return "unknown";
  const hasPickup =
    text.includes("pickup") || text.includes("store pickup") || text.includes("ready for pickup");
  const hasShipping =
    text.includes("ship it") || text.includes("shipping") || text.includes("ships by");
  const hasDelivery = text.includes("delivery");
  if (hasPickup && (hasShipping || hasDelivery)) return "mixed";
  if (hasPickup) return "pickup";
  if (hasShipping || hasDelivery) return "shipping";
  return "unknown";
}

function extractBestbuyItems(root = document) {
  const itemNodes = Array.from(
    root.querySelectorAll(
      ["[data-testid='cart-line-item']", "[data-track='line-item']"].join(","),
    ),
  );

  const items = itemNodes
    .map((node) => {
      const title =
        getTextBySelectors(
          [
            "[data-track='line-item-title']",
            "[data-track='cart-item-title']",
            "[data-testid='cart-line-item-title']",
            ".line-item__title",
            ".cart-item__title",
            ".item-title",
            "h2",
            "h3",
          ],
          node
        ) ||
        [
          "a",
        ].reduce((found, selector) => {
          if (found) return found;
          const links = Array.from(node.querySelectorAll(selector));
          const bestLink = links.find((link) => /\/site\//i.test(link.getAttribute("href") || ""));
          return normalizeWhitespace(bestLink?.textContent || "");
        }, "");
      if (!title) return null;
      const priceText = getTextBySelectors(
        [
          "[data-track='line-item-price']",
          "[data-testid='cart-line-item-price']",
          ".pricing-price__regular-price",
          ".item-price",
          ".price",
        ],
        node
      );
      const quantityText = getTextBySelectors(
        [
          "[data-track='line-item-quantity']",
          "[aria-label*='Quantity']",
          ".quantity .select-selected-value",
          ".quantity",
        ],
        node
      );
      const quantityMatch = quantityText.match(/\b([1-9][0-9]*)\b/);
      const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
      return {
        title,
        priceText,
        unitPrice: parseMoney(priceText),
        quantity,
        fulfillment: detectFulfillmentType(node),
      };
    })
    .filter(Boolean);

  return items;
}

function extractSummaryAmount(labelMatcher, root = document) {
  const rows = Array.from(
    root.querySelectorAll(
      [
        "[data-track='order-summary-subtotal']",
        "[data-track='order-summary-total']",
        "[data-testid='cart-order-summary']",
        ".order-summary",
        "div",
        "li",
        "tr",
        "p",
        "span",
      ].join(",")
    )
  );
  for (const row of rows) {
    const text = normalizeWhitespace(row.textContent || "");
    if (!text || !labelMatcher.test(text)) continue;
    const amount = parseMoney(text);
    if (amount !== null) return amount;
  }
  return null;
}

export function isBestbuyCartEmpty(root = document) {
  const main = root.querySelector("main[data-testid='cart-root'], main");
  const text = normalizeWhitespace(main?.textContent?.slice(0, 800) || "");
  if (/your cart is empty/i.test(text)) return true;
  return extractBestbuyItems(root).length === 0;
}

export function extractBestbuyCartSnapshot(root = document) {
  if (isBestbuyCartEmpty(root)) {
    return {
      itemCount: 0,
      items: [],
      isEmpty: true,
      subtotal: null,
      orderTotal: null,
      fulfillmentCounts: { shipping: 0, pickup: 0, mixed: 0, unknown: 0 },
    };
  }
  const items = extractBestbuyItems(root);
  const subtotal = extractSummaryAmount(/\bsubtotal\b/i, root);
  const orderTotal = extractSummaryAmount(/\b(order\s*total|estimated\s*total|total)\b/i, root);
  const fulfillmentCounts = items.reduce(
    (acc, item) => {
      acc[item.fulfillment] = (acc[item.fulfillment] || 0) + 1;
      return acc;
    },
    { shipping: 0, pickup: 0, mixed: 0, unknown: 0 }
  );

  return {
    itemCount: items.length,
    items,
    subtotal,
    orderTotal,
    fulfillmentCounts,
    isEmpty: items.length === 0,
  };
}

export function initBestbuyRetailerBootstrap() {
  const shippingTierHint = describeTierForUi(SHIPPING_TIER_BESTBUY_LIMITED);
  const cart = extractBestbuyCartSnapshot(document);

  initRetailerCartGiftOptIn({
    sessionPrefix: BESTBUY_SESSION_PREFIX,
    retailerLabel: "Best Buy",
    optInDataAttr: BESTBUY_CART_OPTIN_DATA_ATTR,
    savedBannerAttr: BESTBUY_SAVED_BANNER_ATTR,
    modalId: BESTBUY_GIFT_MODAL_ID,
    shippingTierHint,
    checkoutButtonPatterns: [/^checkout$/i, /^continue to checkout$/i],
    summarySelector: "[data-testid='cart-order-summary']",
    isCartPage: () => BESTBUY_CART_URL_HINTS.some((h) => location.pathname.toLowerCase().includes(h)),
    isCartEmpty: () => isBestbuyCartEmpty(document),
    getCartSnapshot: () => extractBestbuyCartSnapshot(document),
  });

  window.__WRRAPD_BESTBUY_DEBUG__ = {
    retailer: WRRAPD_RETAILER_BESTBUY,
    href: window.location.href,
    shippingTier: SHIPPING_TIER_BESTBUY_LIMITED,
    shippingTierHint,
    cart,
    sampledAt: new Date().toISOString(),
  };
}
