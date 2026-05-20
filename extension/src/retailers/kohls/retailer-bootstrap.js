import {
  SHIPPING_TIER_SINGLE,
  describeTierForUi,
} from "../../content/retailer-common.js";
import { WRRAPD_RETAILER_KOHLS } from "./constants.js";

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

function parseQuantity(node) {
  const quantityText = getTextBySelectors(
    [
      "[data-testid='quantity']",
      "[data-automation-id='quantity']",
      "[name*='quantity']",
      "[aria-label*='Quantity']",
      ".line-item__quantity",
      ".line-item-quantity",
      ".quantity",
    ],
    node
  );
  const quantityMatch = quantityText.match(/\b([1-9][0-9]*)\b/);
  return quantityMatch ? Number(quantityMatch[1]) : 1;
}

function detectFulfillment(node) {
  const text = normalizeWhitespace(node?.textContent || "").toLowerCase();
  if (!text) return "unknown";
  const hasPickup =
    text.includes("pickup") ||
    text.includes("store pickup") ||
    text.includes("pick up") ||
    text.includes("curbside");
  const hasShipping =
    text.includes("ship to") ||
    text.includes("ships to") ||
    text.includes("shipped") ||
    text.includes("shipping") ||
    text.includes("standard shipping");
  if (hasPickup && hasShipping) return "mixed";
  if (hasPickup) return "pickup";
  if (hasShipping) return "shipping";
  return "unknown";
}

function extractSummaryAmount(labelMatcher, root = document) {
  const rowSelectors = [
    "[data-testid='order-summary'] [data-testid='summary-row']",
    "[data-automation-id='order-summary'] [data-automation-id='summary-row']",
    ".order-summary .summary-row",
    ".order-summary li",
    ".order-summary div",
    "li",
    "div",
    "tr",
  ];
  const rows = Array.from(root.querySelectorAll(rowSelectors.join(",")));
  for (const row of rows) {
    const text = normalizeWhitespace(row.textContent || "");
    if (!text || !labelMatcher.test(text)) continue;
    const amount = parseMoney(text);
    if (amount !== null) return amount;
  }
  return null;
}

function extractKohlsItems(root = document) {
  const selectors = [
    "[data-testid='cart-line-item']",
    "[data-testid='bag-item']",
    "[data-automation-id='cart-line-item']",
    "[data-automation-id='bag-item']",
    ".bag-item",
    ".cart-item",
    ".line-item",
  ];
  const seen = new Set();
  const nodes = [];
  for (const selector of selectors) {
    for (const node of root.querySelectorAll(selector)) {
      if (seen.has(node)) continue;
      seen.add(node);
      nodes.push(node);
    }
  }

  return nodes
    .map((node) => {
      const title = getTextBySelectors(
        [
          "[data-testid='item-title']",
          "[data-automation-id='item-title']",
          ".bag-item__title",
          ".line-item__title",
          ".product-title",
          "h2",
          "h3",
          "a[title]",
          "a",
        ],
        node
      );
      if (!title) return null;
      const priceText = getTextBySelectors(
        [
          "[data-testid='item-price']",
          "[data-automation-id='item-price']",
          ".bag-item__price",
          ".line-item__price",
          ".price .amount",
          ".price",
        ],
        node
      );
      return {
        title,
        priceText,
        unitPrice: parseMoney(priceText),
        quantity: parseQuantity(node),
        fulfillment: detectFulfillment(node),
      };
    })
    .filter(Boolean);
}

export function extractKohlsCartSnapshot(root = document) {
  const items = extractKohlsItems(root);
  const subtotal = extractSummaryAmount(/\bsubtotal\b/i, root);
  const orderTotal = extractSummaryAmount(/\b(total|order total|estimated total)\b/i, root);
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
  };
}

export function initKohlsRetailerBootstrap() {
  window.__WRRAPD_KOHLS_DEBUG__ = {
    retailer: WRRAPD_RETAILER_KOHLS,
    href: window.location.href,
    shippingTier: SHIPPING_TIER_SINGLE,
    shippingTierHint: describeTierForUi(SHIPPING_TIER_SINGLE),
    cart: extractKohlsCartSnapshot(document),
    sampledAt: new Date().toISOString(),
  };
}
