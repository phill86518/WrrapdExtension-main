import { initRetailerCheckoutPayFlow } from "../../shared/retailer-checkout-pay-flow.js";
import { fillHubShippingFieldsByAutocomplete } from "../../shared/wrrapd-hub.js";
import { KOHLS_CHECKOUT_URL_HINTS, KOHLS_SESSION_PREFIX } from "./constants.js";
import { extractKohlsCartSnapshot } from "./retailer-bootstrap.js";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isKohlsPayGatePage() {
  const path = location.pathname.toLowerCase();
  return KOHLS_CHECKOUT_URL_HINTS.some((h) => path.includes(h));
}

function findKohlsCheckoutButtons() {
  /** @type {HTMLElement[]} */
  const buttons = [];
  const seen = new Set();

  const add = (node) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    buttons.push(node);
  };

  for (const sel of [
    // Kohl's live bag/checkout CTA is a <kds-button> web component.
    "kds-button.checkout-button",
    "kds-button[data-testid^='checkout-btn']",
    "[data-testid^='checkout-btn']",
    ".checkout-button",
    ".checkout-btn",
    "[data-testid='checkout-button']",
    "[data-automation-id='checkout-button']",
    "button[name='checkout']",
  ]) {
    document.querySelectorAll(sel).forEach(add);
  }

  for (const node of document.querySelectorAll(
    "button, a[role='button'], input[type='submit'], kds-button",
  )) {
    const text = normalizeWhitespace(
      node.textContent || node.value || node.getAttribute?.("title") || "",
    );
    if (/^(checkout|proceed to checkout|place order|continue)$/i.test(text)) add(node);
  }

  return buttons;
}

function findKohlsCheckoutButton() {
  return findKohlsCheckoutButtons()[0] || null;
}

/**
 * Stable mount for the Wrrapd pay summary. Kohl's checkout CTA is a <kds-button> web
 * component inside a framework-managed panel; mounting next to it (the shared default)
 * gets wiped on re-render. Anchor to structural containers instead so the summary + pay
 * button persist — preferring the right-hand order-summary rail next to the totals.
 */
function findKohlsSummaryMountAnchor() {
  const directChild = (parent, selector) => {
    if (!parent) return null;
    for (const child of parent.children) {
      if (child.matches?.(selector)) return child;
    }
    return null;
  };

  // 1) Top of the order-summary rail (right column), above the summary block.
  const summary = document.querySelector(
    "[data-testid='order-summary'], .order-summary-container",
  );
  if (summary?.parentElement) {
    return { parent: summary.parentElement, before: summary };
  }
  const summaryBlock = document.querySelector(".order-summary-block");
  if (summaryBlock?.parentElement) {
    return { parent: summaryBlock.parentElement, before: summaryBlock };
  }

  // 2) Right column container, then left column (above the items), then cart screen.
  const rightColumn = document.querySelector(".right-column-block");
  if (rightColumn) return { parent: rightColumn, before: rightColumn.firstElementChild };
  const leftColumn = document.querySelector(".left-column-block");
  if (leftColumn) {
    const before =
      directChild(leftColumn, ".cartItemPanel-hook-position, .cart-item-panel") ||
      leftColumn.firstElementChild;
    return { parent: leftColumn, before };
  }
  const cartScreen = document.querySelector(
    "#main-content-cart, [data-testid='smart-cart-screen-block'], .smart-cart-screen-block",
  );
  if (cartScreen) return { parent: cartScreen, before: cartScreen.firstElementChild };
  return null;
}

export function initKohlsCheckoutPayFlow() {
  if (!location.hostname.includes("kohls.com")) return;
  initRetailerCheckoutPayFlow({
    retailerName: "Kohl's",
    payRoute: "kohls",
    sessionPrefix: KOHLS_SESSION_PREFIX,
    isCheckoutPage: isKohlsPayGatePage,
    findCheckoutButton: findKohlsCheckoutButton,
    findGatedCheckoutButtons: findKohlsCheckoutButtons,
    findSummaryMountAnchor: findKohlsSummaryMountAnchor,
    // Kohl's lets shoppers change shipping speed/expedite, so a scraped concrete delivery date is
    // unreliable. Skip capture → confirmation email uses "Kohl's delivery date + 1 day" wording.
    captureDeliveryDate: false,
    getCartSnapshot: () => extractKohlsCartSnapshot(document),
    fillHubShippingFields: fillHubShippingFieldsByAutocomplete,
    paymentPendingHint: "Please complete payment to Wrrapd before proceeding to checkout.",
  });
}
