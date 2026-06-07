import { initRetailerCheckoutPayFlow } from "../../shared/retailer-checkout-pay-flow.js";
import { fillHubShippingFieldsByAutocomplete } from "../../shared/wrrapd-hub.js";
import { ETSY_CHECKOUT_URL_HINTS, ETSY_SESSION_PREFIX } from "./constants.js";
import { extractEtsyCartSnapshot } from "./retailer-bootstrap.js";

function isEtsyCheckoutPage() {
  const path = location.pathname.toLowerCase();
  return ETSY_CHECKOUT_URL_HINTS.some((h) => path.includes(h));
}

function findEtsyCheckoutButton() {
  return (
    document.querySelector("[data-selector='cart-submit-button']") ||
    document.querySelector(".proceed-to-checkout") ||
    [...document.querySelectorAll("button, a[role='button']")].find((b) =>
      /^(proceed to checkout|place your order|continue to checkout)/i.test(
        (b.textContent || "").replace(/\s+/g, " ").trim(),
      ),
    ) ||
    null
  );
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
    getCartSnapshot: () => extractEtsyCartSnapshot(document),
    fillHubShippingFields: fillEtsyHubShippingFields,
  });
}
