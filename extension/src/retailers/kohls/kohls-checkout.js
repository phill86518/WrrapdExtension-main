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
    "[data-testid='checkout-button']",
    "[data-automation-id='checkout-button']",
    "button[name='checkout']",
  ]) {
    document.querySelectorAll(sel).forEach(add);
  }

  for (const node of document.querySelectorAll("button, a[role='button'], input[type='submit']")) {
    const text = normalizeWhitespace(node.textContent || node.value || "");
    if (/^(checkout|proceed to checkout|place order|continue)$/i.test(text)) add(node);
  }

  return buttons;
}

function findKohlsCheckoutButton() {
  return findKohlsCheckoutButtons()[0] || null;
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
    getCartSnapshot: () => extractKohlsCartSnapshot(document),
    fillHubShippingFields: fillHubShippingFieldsByAutocomplete,
    paymentPendingHint: "Please complete payment to Wrrapd before proceeding to checkout.",
  });
}
