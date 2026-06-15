import { initRetailerCheckoutPayFlow } from "../../shared/retailer-checkout-pay-flow.js";
import { fillHubShippingFieldsByAutocomplete } from "../../shared/wrrapd-hub.js";
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

function findWalmartCheckoutButton() {
  return (
    document.querySelector("button[data-automation-id='checkout']") ||
    document.querySelector("#Continue\\ to\\ checkout\\ button") ||
    document.querySelector("button[data-automation-id='place-order']") ||
    document.querySelector("button[data-automation-id='continue']") ||
    document.querySelector("button[data-automation-id='submit-order']") ||
    [...document.querySelectorAll("button, a[role='button'], input[type='submit']")].find((node) =>
      /^(continue to checkout|place order|submit order|review order|check out)$/i.test(
        normalizeWhitespace(node.textContent || node.value || ""),
      ),
    ) ||
    null
  );
}

export function initWalmartCheckoutPayFlow() {
  if (!location.hostname.includes("walmart.com")) return;
  initRetailerCheckoutPayFlow({
    retailerName: "Walmart",
    payRoute: "walmart",
    sessionPrefix: WALMART_SESSION_PREFIX,
    isCheckoutPage: isWalmartPayGatePage,
    findCheckoutButton: findWalmartCheckoutButton,
    getCartSnapshot: () => extractWalmartCartSnapshot(document),
    fillHubShippingFields: fillHubShippingFieldsByAutocomplete,
    paymentPendingHint: "Please complete payment to Wrrapd before proceeding to checkout.",
  });
}
