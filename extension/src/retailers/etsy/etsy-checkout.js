import { initRetailerCheckoutPayFlow } from "../../shared/retailer-checkout-pay-flow.js";
import { fillHubShippingFieldsByAutocomplete } from "../../shared/wrrapd-hub.js";
import { ETSY_CHECKOUT_URL_HINTS, ETSY_SESSION_PREFIX } from "./constants.js";
import { extractEtsyCartSnapshot } from "./retailer-bootstrap.js";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isEtsyCheckoutPage() {
  const path = location.pathname.toLowerCase();
  return ETSY_CHECKOUT_URL_HINTS.some((h) => path.includes(h));
}

function findEtsyCheckoutButtons() {
  /** @type {HTMLElement[]} */
  const buttons = [];
  const seen = new Set();

  const add = (node) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    buttons.push(node);
  };

  for (const sel of ["[data-selector='cart-submit-button']", ".proceed-to-checkout"]) {
    document.querySelectorAll(sel).forEach(add);
  }

  for (const node of document.querySelectorAll("button, a[role='button'], a.proceed-to-checkout, input[type='submit']")) {
    const text = normalizeWhitespace(node.textContent || node.value || "");
    if (/^(proceed to checkout|place your order|continue to checkout|check out)$/i.test(text)) add(node);
  }

  return buttons;
}

function findEtsyCheckoutButton() {
  return findEtsyCheckoutButtons()[0] || null;
}

/**
 * Etsy doesn't expose a captured shipping-form DOM yet, so we fill the hub
 * address via standard autocomplete tokens (best-effort). Refine with
 * Etsy-specific selectors once we have the checkout shipping DOM.
 */
function fillEtsyHubShippingFields() {
  fillHubShippingFieldsByAutocomplete();
}

export function initEtsyCheckoutPayFlow() {
  if (!location.hostname.includes("etsy.com")) return;
  initRetailerCheckoutPayFlow({
    retailerName: "Etsy",
    payRoute: "etsy",
    sessionPrefix: ETSY_SESSION_PREFIX,
    isCheckoutPage: isEtsyCheckoutPage,
    findCheckoutButton: findEtsyCheckoutButton,
    findGatedCheckoutButtons: findEtsyCheckoutButtons,
    getCartSnapshot: () => extractEtsyCartSnapshot(document),
    fillHubShippingFields: fillEtsyHubShippingFields,
    paymentPendingHint: "Please complete payment to Wrrapd before proceeding to checkout.",
  });
}
