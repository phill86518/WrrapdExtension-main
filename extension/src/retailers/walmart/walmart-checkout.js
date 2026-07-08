import { initRetailerCheckoutPayFlow } from "../../shared/retailer-checkout-pay-flow.js";
import { fillAndLockHubShippingFields } from "../../shared/wrrapd-hub.js";
import {
  WALMART_CART_URL_HINTS,
  WALMART_CHECKOUT_URL_HINTS,
  WALMART_SESSION_PREFIX,
} from "./constants.js";
import { extractWalmartCartSnapshot } from "./retailer-bootstrap.js";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

/** Cart + checkout: gate "Continue to checkout" on the cart page and place-order on checkout. */
function isWalmartPayGatePage() {
  const path = location.pathname.toLowerCase();
  return (
    WALMART_CART_URL_HINTS.some((h) => path.includes(h)) ||
    WALMART_CHECKOUT_URL_HINTS.some((h) => path.includes(h))
  );
}

function findWalmartCheckoutButtons() {
  /** @type {HTMLElement[]} */
  const buttons = [];
  const seen = new Set();

  const add = (node) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    buttons.push(node);
  };

  for (const sel of [
    "button[data-automation-id='checkout']",
    "#Continue\\ to\\ checkout\\ button",
    "button[data-automation-id='place-order']",
    "button[data-automation-id='continue']",
    "button[data-automation-id='submit-order']",
  ]) {
    document.querySelectorAll(sel).forEach(add);
  }

  for (const node of document.querySelectorAll("button, a[role='button'], input[type='submit']")) {
    const text = normalizeWhitespace(node.textContent || node.value || "");
    if (/^(continue to checkout|place order|submit order|review order|check out)$/i.test(text)) add(node);
  }

  return buttons;
}

function findWalmartCheckoutButton() {
  return findWalmartCheckoutButtons()[0] || null;
}

export function initWalmartCheckoutPayFlow() {
  if (!location.hostname.includes("walmart.com")) return;
  initRetailerCheckoutPayFlow({
    retailerName: "Walmart",
    payRoute: "walmart",
    sessionPrefix: WALMART_SESSION_PREFIX,
    isCheckoutPage: isWalmartPayGatePage,
    findCheckoutButton: findWalmartCheckoutButton,
    findGatedCheckoutButtons: findWalmartCheckoutButtons,
    getCartSnapshot: () => extractWalmartCartSnapshot(document),
    fillHubShippingFields: fillAndLockHubShippingFields,
    paymentPendingHint: "Please complete payment to Wrrapd before proceeding to checkout.",
  });
}
