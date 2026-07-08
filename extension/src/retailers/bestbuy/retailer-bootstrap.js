import { exposeDebugGlobal } from "../../shared/store-build.js";
import {
  SHIPPING_TIER_BESTBUY_LIMITED,
  describeTierForUi,
} from "../../content/retailer-common.js";
import { readItemChoices } from "../../shared/cart-gift-session.js";
import { initRetailerCartGiftOptIn } from "../../shared/cart-gift-optin.js";
import { initWrrapdConflictGuard } from "../../shared/wrrapd-conflict-guard.js";
import { isExcludedScrapeRegion } from "../../shared/cart-scrape-region.js";
import { detectItemFulfillment } from "../../shared/cart-fulfillment.js";
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
  return detectItemFulfillment(itemRoot);
}

function isBestbuyProductHref(href) {
  const path = String(href || "");
  return (
    /\/site\/[^?#]*\.p(\?|#|$)/i.test(path) ||
    /[?&]skuId=/i.test(path) ||
    /\/product\/[^?#]+\/sku\/\d+/i.test(path)
  );
}

function extractBestbuyItems(root = document) {
  const itemSelectors = [
    ".fluid-item[data-test-sku]",
    "[data-testid='cart-line-item']",
    "[data-track='line-item']",
    // Best Buy's current React cart renders each line item as `.fluid-item`
    // (large view) / `.small-view-item` (small view) with `cart-item__*` children.
    ".fluid-item.flex",
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
            "a.cart-item__title",
            ".cart-item__title",
            ".cart-item__title-heading a",
            ".item-title",
            "h2",
            "h3",
          ],
          node,
        ) ||
        Array.from(node.querySelectorAll("a[href*='/site/'], a[href*='/product/']")).reduce(
          (found, link) => {
            if (found) return found;
            const href = link.getAttribute("href") || "";
            if (!isBestbuyProductHref(href)) return found;
            return normalizeWhitespace(link.textContent || link.getAttribute("title") || "");
          },
          "",
        );
      if (!title) return null;
      const priceText = getTextBySelectors(
        [
          "[data-track='line-item-price']",
          "[data-testid='cart-line-item-price']",
          "[data-testid='customer-price']",
          ".fluid-item__price",
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
  const scope =
    root.querySelector(
      ".fluid-large-view__main-content, main[data-testid='cart-root'], main, [role='main']",
    ) || root;
  for (const link of scope.querySelectorAll("a[href*='/site/'], a[href*='/product/']")) {
    const href = link.getAttribute("href") || "";
    if (!href || linkSeen.has(href)) continue;
    if (!isBestbuyProductHref(href)) continue;
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

function findBestbuyOrderSummaryRoot(root = document) {
  return (
    root.querySelector(".order-summary .price-summary") ||
    root.querySelector(".order-summary") ||
    root.querySelector("#cart-order-summary")?.closest(".order-summary") ||
    root.querySelector("section[aria-label='order summary']")
  );
}

function extractSummaryAmount(labelMatcher, root = document) {
  // Never scan the whole Best Buy document — the cart page is huge and a broad
  // `div, li, tr, p, span` query freezes the content script before the panel mounts.
  const scope = findBestbuyOrderSummaryRoot(root);
  if (!scope) return null;

  for (const row of scope.querySelectorAll(
    "tr, [data-track='order-summary-subtotal'], [data-track='order-summary-total']",
  )) {
    const text = normalizeWhitespace(row.textContent || "");
    if (!text || !labelMatcher.test(text)) continue;
    const amount = parseMoney(text);
    if (amount !== null) return amount;
  }
  return null;
}

export function findBestbuyCartMountAnchor() {
  const directChild = (parent, selector) => {
    if (!parent) return null;
    for (const child of parent.children) {
      if (child.matches?.(selector)) return child;
    }
    return null;
  };

  // 1) Top of the order-summary card in the right sidebar — stable across React re-renders.
  const summary = document.querySelector(".order-summary");
  if (summary) {
    const before =
      document.getElementById("cart-order-summary") ||
      directChild(summary, ".order-summary__heading") ||
      summary.firstElementChild;
    return { parent: summary, before };
  }

  // 2) Top of the cart's main column, below the "Your Cart" heading.
  const mainContent = document.querySelector(".fluid-large-view__main-content");
  if (mainContent) {
    const pageHeading = directChild(mainContent, ".page-heading");
    if (pageHeading?.nextElementSibling) {
      return { parent: mainContent, before: pageHeading.nextElementSibling };
    }
    return { parent: mainContent, before: mainContent.firstElementChild };
  }

  // 3) Sidebar shell, then checkout CTA row.
  const sidebar = document.querySelector(
    "section.fluid-large-view__sidebar, .fluid-large-view__sidebar",
  );
  if (sidebar) {
    const inner =
      sidebar.querySelector(
        ".fluid-large-view__sidebar-content-wrapper, .fluid-large-view__sidebar-content",
      ) || sidebar;
    return { parent: inner, before: inner.firstElementChild };
  }

  for (const sel of [
    ".checkout-buttons__checkout button",
    "button[data-track*='Checkout']",
    "[data-track='checkout']",
    "button[data-testid='checkout-button']",
    "a[data-track='checkout']",
    "a[href*='/checkout/r/']",
  ]) {
    const btn = document.querySelector(sel);
    if (btn?.parentElement) return { parent: btn.parentElement, before: btn };
  }

  for (const node of document.querySelectorAll(
    "button, a[role='button'], a.btn-primary, input[type='submit']",
  )) {
    const text = normalizeWhitespace(node.textContent || node.value || "");
    if (/^(checkout|continue to checkout)$/i.test(text) && node.parentElement) {
      return { parent: node.parentElement, before: node };
    }
  }

  const main = document.querySelector("main[data-testid='cart-root'], main, [role='main']");
  if (main) return { parent: main, before: main.firstElementChild };
  return null;
}

function isBestbuyCheckoutPath(pathname = location.pathname) {
  return String(pathname || "").toLowerCase().includes("/checkout");
}

export function isBestbuyCartEmpty(root = document) {
  const main = root.querySelector(
    ".fluid-large-view__main-content, main[data-testid='cart-root'], main",
  );
  const text = normalizeWhitespace(main?.textContent?.slice(0, 800) || "");
  if (/your cart is empty/i.test(text)) return true;
  return extractBestbuyItems(root).length === 0;
}

export function getBestbuyCartSnapshotSafe(root = document) {
  try {
    const snap = extractBestbuyCartSnapshot(root);
    if (snap.itemCount > 0 || !isBestbuyCheckoutPath()) return snap;

    // Checkout markup often omits line-item tiles; keep the opt-in alive from session.
    const choices = readItemChoices(BESTBUY_SESSION_PREFIX);
    if (choices.length === 0) return snap;
    return {
      ...snap,
      itemCount: choices.length,
      items: choices.map((choice, index) => ({
        title: choice.title || `Item ${index + 1}`,
        priceText: "",
        unitPrice: null,
        quantity: 1,
        fulfillment: "unknown",
      })),
      isEmpty: false,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[Wrrapd] Best Buy cart snapshot failed:", err);
    return {
      itemCount: 0,
      items: [],
      isEmpty: false,
      subtotal: null,
      orderTotal: null,
      fulfillmentCounts: { shipping: 0, pickup: 0, mixed: 0, unknown: 0 },
    };
  }
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
  let cart = null;
  try {
    cart = getBestbuyCartSnapshotSafe(document);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[Wrrapd] Best Buy cart snapshot failed (continuing to mount anyway):", err);
  }

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
    checkoutButtonPatterns: [/^checkout$/i, /^continue to checkout$/i, /^place order$/i],
    summarySelector: ".order-summary, #cart-order-summary, [data-testid='cart-order-summary']",
    findMountAnchor: findBestbuyCartMountAnchor,
    isCartPage: isBestbuyCartOrCheckoutPage,
    isCheckoutPage: isBestbuyCartOrCheckoutPage,
    isCartEmpty: () => {
      try {
        return isBestbuyCartEmpty(document);
      } catch {
        return false;
      }
    },
    getCartSnapshot: () => getBestbuyCartSnapshotSafe(document),
  });

  initWrrapdConflictGuard({
    sessionPrefix: BESTBUY_SESSION_PREFIX,
    retailerLabel: "Best Buy",
    savedBannerAttr: BESTBUY_SAVED_BANNER_ATTR,
    isCheckoutPage: isBestbuyCheckoutPath,
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
