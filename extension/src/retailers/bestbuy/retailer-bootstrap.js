import { exposeDebugGlobal } from "../../shared/store-build.js";
import {
  SHIPPING_TIER_BESTBUY_LIMITED,
  describeTierForUi,
} from "../../content/retailer-common.js";
import { initRetailerCartGiftOptIn } from "../../shared/cart-gift-optin.js";
import { initWrrapdConflictGuard } from "../../shared/wrrapd-conflict-guard.js";
import { isExcludedScrapeRegion } from "../../shared/cart-scrape-region.js";
import {
  BESTBUY_CART_OPTIN_DATA_ATTR,
  BESTBUY_CART_URL_HINTS,
  BESTBUY_CHECKOUT_URL_HINTS,
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
  const itemSelectors = [
    "[data-testid='cart-line-item']",
    "[data-track='line-item']",
    // Best Buy's current React cart renders each line item as `.fluid-item`
    // (large view) / `.small-view-item` (small view) with `cart-item__*` children.
    ".fluid-item",
    ".small-view-item--parent",
    "li.cart-item",
    ".cart-item",
    "[class*='cart-line-item']",
    "[class*='CartLineItem']",
    "article[class*='line-item']",
  ];
  const seen = new Set();
  const itemNodes = [];
  for (const sel of itemSelectors) {
    for (const node of root.querySelectorAll(sel)) {
      if (seen.has(node)) continue;
      if (isExcludedScrapeRegion(node)) continue;
      seen.add(node);
      itemNodes.push(node);
    }
  }

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
          node,
        ) ||
        Array.from(node.querySelectorAll("a[href*='/site/']")).reduce((found, link) => {
          if (found) return found;
          return normalizeWhitespace(link.textContent || link.getAttribute("title") || "");
        }, "");
      if (!title) return null;
      const priceText = getTextBySelectors(
        [
          "[data-track='line-item-price']",
          "[data-testid='cart-line-item-price']",
          "[data-testid='customer-price']",
          ".pricing-price__regular-price",
          ".item-price",
          ".price",
        ],
        node,
      );
      const quantityText = getTextBySelectors(
        [
          "[data-track='line-item-quantity']",
          "[aria-label*='Quantity']",
          ".quantity .select-selected-value",
          ".quantity",
        ],
        node,
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

  if (items.length > 0) return items;

  /** Fallback: real product tiles link to /site/<slug>/<sku>.p (or carry skuId=). */
  const linkSeen = new Set();
  /** @type {typeof items} */
  const fromLinks = [];
  const scope = root.querySelector("main[data-testid='cart-root'], main, [role='main']") || root;
  for (const link of scope.querySelectorAll("a[href*='/site/']")) {
    const href = link.getAttribute("href") || "";
    if (!href || linkSeen.has(href)) continue;
    // Only genuine product pages — excludes footer help/legal links (Terms, Privacy, etc.)
    // that also live under /site/ but are not products.
    if (!/\/site\/[^?#]*\.p(\?|#|$)/i.test(href) && !/[?&]skuId=/i.test(href)) continue;
    // Skip recommendations / "you may also like" / sponsored / footer regions.
    if (isExcludedScrapeRegion(link)) continue;
    const title = normalizeWhitespace(link.textContent || link.getAttribute("title") || "");
    if (!title || title.length < 4) continue;
    linkSeen.add(href);
    const row =
      link.closest(
        "[data-testid='cart-line-item'], [data-track='line-item'], li, article, section, div[class*='item']",
      ) || link.parentElement;
    const priceText = row
      ? getTextBySelectors(
          ["[data-testid='cart-line-item-price']", "[data-testid='customer-price']", ".price"],
          row,
        )
      : "";
    fromLinks.push({
      title,
      priceText,
      unitPrice: parseMoney(priceText),
      quantity: row ? 1 : 1,
      fulfillment: row ? detectFulfillmentType(row) : "unknown",
    });
  }
  return fromLinks;
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

  const isBestbuyCartOrCheckoutPage = () => {
    const path = location.pathname.toLowerCase();
    return (
      BESTBUY_CART_URL_HINTS.some((h) => path.includes(h)) ||
      BESTBUY_CHECKOUT_URL_HINTS.some((h) => path.includes(h))
    );
  };

  initRetailerCartGiftOptIn({
    sessionPrefix: BESTBUY_SESSION_PREFIX,
    retailerLabel: "Best Buy",
    optInDataAttr: BESTBUY_CART_OPTIN_DATA_ATTR,
    savedBannerAttr: BESTBUY_SAVED_BANNER_ATTR,
    modalId: BESTBUY_GIFT_MODAL_ID,
    shippingTierHint,
    checkoutButtonPatterns: [/^checkout$/i, /^continue to checkout$/i],
    summarySelector: "[data-testid='cart-order-summary'], .order-summary",
    findMountAnchor: () => {
      for (const sel of [
        "[data-track='checkout']",
        "button[data-testid='checkout-button']",
        "a[data-track='checkout']",
        "a[href*='/checkout/r/']",
        ".btn-primary[href*='checkout']",
      ]) {
        const btn = document.querySelector(sel);
        if (btn?.parentElement) return { parent: btn.parentElement, before: btn };
      }
      for (const node of document.querySelectorAll("button, a[role='button'], a.btn-primary, input[type='submit']")) {
        const text = normalizeWhitespace(node.textContent || node.value || "");
        if (/^(checkout|continue to checkout)$/i.test(text) && node.parentElement) {
          return { parent: node.parentElement, before: node };
        }
      }
      const summary = document.querySelector("[data-testid='cart-order-summary'], .order-summary");
      if (summary?.parentElement) return { parent: summary.parentElement, before: summary };
      const main = document.querySelector("main[data-testid='cart-root'], main");
      if (main) return { parent: main, before: main.firstElementChild };
      return null;
    },
    isCartPage: isBestbuyCartOrCheckoutPage,
    isCheckoutPage: isBestbuyCartOrCheckoutPage,
    isCartEmpty: () => isBestbuyCartEmpty(document),
    getCartSnapshot: () => extractBestbuyCartSnapshot(document),
  });

  initWrrapdConflictGuard({
    sessionPrefix: BESTBUY_SESSION_PREFIX,
    retailerLabel: "Best Buy",
    savedBannerAttr: BESTBUY_SAVED_BANNER_ATTR,
  });

  exposeDebugGlobal("__WRRAPD_BESTBUY_DEBUG__", {
    retailer: WRRAPD_RETAILER_BESTBUY,
    href: window.location.href,
    shippingTier: SHIPPING_TIER_BESTBUY_LIMITED,
    shippingTierHint,
    cart,
    sampledAt: new Date().toISOString(),
  });
}
