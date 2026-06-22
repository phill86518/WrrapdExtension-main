import { exposeDebugGlobal } from "../../shared/store-build.js";
import {
  SHIPPING_TIER_SINGLE,
  describeTierForUi,
} from "../../content/retailer-common.js";
import { initRetailerCartGiftOptIn } from "../../shared/cart-gift-optin.js";
import { initWrrapdConflictGuard } from "../../shared/wrrapd-conflict-guard.js";
import { isExcludedScrapeRegion } from "../../shared/cart-scrape-region.js";
import {
  KOHLS_CART_OPTIN_DATA_ATTR,
  KOHLS_CART_URL_HINTS,
  KOHLS_CHECKOUT_URL_HINTS,
  KOHLS_GIFT_MODAL_ID,
  KOHLS_SAVED_BANNER_ATTR,
  KOHLS_SESSION_PREFIX,
  WRRAPD_RETAILER_KOHLS,
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
    // Kohl's redesigned cart (current): one `.cart-item-panel-item` per product line.
    ".cart-item-panel-item",
    "[data-testid='cart-line-item']",
    "[data-testid='bag-item']",
    "[data-automation-id='cart-line-item']",
    "[data-automation-id='bag-item']",
    ".bag-item",
    ".cart-line-item",
    "[class*='bag-item']",
    "[class*='cart-line-item']",
  ];
  const seen = new Set();
  const nodes = [];
  for (const selector of selectors) {
    for (const node of root.querySelectorAll(selector)) {
      if (seen.has(node)) continue;
      if (isExcludedScrapeRegion(node)) continue;
      seen.add(node);
      nodes.push(node);
    }
  }

  const itemsFromNodes = nodes
    .map((node) => {
      const title = getTextBySelectors(
        [
          ".product-name a",
          ".product-name",
          "[data-testid='item-title']",
          "[data-automation-id='item-title']",
          ".bag-item__title",
          ".line-item__title",
          ".product-title",
          "h2",
          "h3",
          "a[href*='/product/prd-']",
          "a[title]",
          "a[href*='/product/']",
          "a",
        ],
        node,
      );
      if (!title) return null;
      const priceText = getTextBySelectors(
        [
          ".product-price-list-sale-price",
          ".final-item-price-container",
          ".product-price-list-strikethrough",
          "[data-testid='item-price']",
          "[data-automation-id='item-price']",
          ".bag-item__price",
          ".line-item__price",
          ".price .amount",
          ".price",
        ],
        node,
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

  if (itemsFromNodes.length > 0) return itemsFromNodes;

  /** Fallback: Kohl's bag lines often expose stable /product/prd-* links only. */
  const linkSeen = new Set();
  /** @type {ReturnType<typeof extractKohlsItems>} */
  const fromLinks = [];
  const scope =
    root.querySelector("main, [role='main'], #main-content, .shopping-bag, .cart-container") || root;
  for (const link of scope.querySelectorAll("a[href*='/product/prd-'], a[href*='/product/prd']")) {
    const href = link.getAttribute("href") || "";
    if (!href || linkSeen.has(href)) continue;
    // Skip "You may like these", recently-viewed, sponsored, footer/nav regions.
    if (isExcludedScrapeRegion(link)) continue;
    const title = normalizeWhitespace(link.getAttribute("title") || link.textContent || "");
    if (!title || title.length < 4) continue;
    linkSeen.add(href);
    const row =
      link.closest("[data-testid='bag-item'], [data-automation-id='bag-item'], .bag-item, li, article, section, div") ||
      link.parentElement;
    const priceText = row
      ? getTextBySelectors(["[data-testid='item-price']", ".price", "[class*='price']"], row)
      : "";
    fromLinks.push({
      title,
      priceText,
      unitPrice: parseMoney(priceText),
      quantity: row ? parseQuantity(row) : 1,
      fulfillment: row ? detectFulfillment(row) : "unknown",
    });
  }
  return fromLinks;
}

export function isKohlsCartEmpty(root = document) {
  if (root.querySelector("[data-testid='empty-cart'], [data-automation-id='empty-cart'], .empty-cart-message")) {
    return true;
  }
  const pageText = normalizeWhitespace(
    root.querySelector("main, [role='main'], #main-content")?.textContent?.slice(0, 1200) || "",
  );
  if (/your (shopping )?(bag|cart) is empty/i.test(pageText)) return true;
  return extractKohlsItems(root).length === 0;
}

export function extractKohlsCartSnapshot(root = document) {
  if (isKohlsCartEmpty(root)) {
    return {
      itemCount: 0,
      items: [],
      isEmpty: true,
      subtotal: null,
      orderTotal: null,
      fulfillmentCounts: { shipping: 0, pickup: 0, mixed: 0, unknown: 0 },
    };
  }
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
    isEmpty: items.length === 0,
  };
}

export function initKohlsRetailerBootstrap() {
  const shippingTierHint = describeTierForUi(SHIPPING_TIER_SINGLE);
  // The opt-in mount must never depend on the initial debug snapshot succeeding — Kohl's bag
  // markup shifts, and a scrape throw here previously killed the whole bootstrap before the panel
  // ever mounted. Capture defensively; the live snapshot used for mounting runs inside the opt-in.
  let cart = null;
  try {
    cart = extractKohlsCartSnapshot(document);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[Wrrapd] Kohl's cart snapshot failed (continuing to mount anyway):", err);
  }

  const isKohlsCartOrCheckoutPage = () => {
    const path = location.pathname.toLowerCase();
    return (
      KOHLS_CART_URL_HINTS.some((h) => path.includes(h)) ||
      KOHLS_CHECKOUT_URL_HINTS.some((h) => path.includes(h))
    );
  };

  initRetailerCartGiftOptIn({
    sessionPrefix: KOHLS_SESSION_PREFIX,
    retailerLabel: "Kohl's",
    optInDataAttr: KOHLS_CART_OPTIN_DATA_ATTR,
    savedBannerAttr: KOHLS_SAVED_BANNER_ATTR,
    modalId: KOHLS_GIFT_MODAL_ID,
    shippingTierHint,
    checkoutButtonPatterns: [/^checkout$/i, /^proceed to checkout$/i, /^check out$/i],
    summarySelector: "aside[data-testid='order-summary'], [data-testid='order-summary'], .order-summary",
    findMountAnchor: () => {
      for (const sel of [
        "[data-testid='checkout-button']",
        "[data-automation-id='checkout-button']",
        "button[name='checkout']",
        "a[href*='checkout']",
      ]) {
        const btn = document.querySelector(sel);
        if (btn?.parentElement) return { parent: btn.parentElement, before: btn };
      }
      for (const node of document.querySelectorAll("button, a[role='button'], input[type='submit']")) {
        const text = normalizeWhitespace(node.textContent || node.value || "");
        if (/^(checkout|proceed to checkout|check out)$/i.test(text) && node.parentElement) {
          return { parent: node.parentElement, before: node };
        }
      }
      const summary = document.querySelector(
        "aside[data-testid='order-summary'], [data-testid='order-summary'], .order-summary",
      );
      if (summary?.parentElement) return { parent: summary.parentElement, before: summary };
      const main = document.querySelector("main, [role='main'], #main-content");
      if (main) return { parent: main, before: main.firstElementChild };
      return null;
    },
    isCartPage: isKohlsCartOrCheckoutPage,
    isCheckoutPage: isKohlsCartOrCheckoutPage,
    isCartEmpty: () => {
      try {
        return isKohlsCartEmpty(document);
      } catch {
        return false;
      }
    },
    getCartSnapshot: () => {
      try {
        return extractKohlsCartSnapshot(document);
      } catch {
        return {
          itemCount: 0,
          items: [],
          isEmpty: false,
          subtotal: null,
          orderTotal: null,
          fulfillmentCounts: { shipping: 0, pickup: 0, mixed: 0, unknown: 0 },
        };
      }
    },
  });

  initWrrapdConflictGuard({
    sessionPrefix: KOHLS_SESSION_PREFIX,
    retailerLabel: "Kohl's",
    savedBannerAttr: KOHLS_SAVED_BANNER_ATTR,
  });

  exposeDebugGlobal("__WRRAPD_KOHLS_DEBUG__", {
    retailer: WRRAPD_RETAILER_KOHLS,
    href: window.location.href,
    shippingTier: SHIPPING_TIER_SINGLE,
    shippingTierHint,
    cart,
    sampledAt: new Date().toISOString(),
  });
}
