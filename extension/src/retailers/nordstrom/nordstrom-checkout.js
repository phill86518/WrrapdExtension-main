import { initRetailerCheckoutPayFlow } from "../../shared/retailer-checkout-pay-flow.js";
import { fillHubShippingFieldsByAutocomplete } from "../../shared/wrrapd-hub.js";
import { NORDSTROM_CHECKOUT_URL_HINTS, NORDSTROM_SESSION_PREFIX } from "./constants.js";
import { extractNordstromCartSnapshot } from "./retailer-bootstrap.js";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isNordstromCheckoutPage() {
  const path = location.pathname.toLowerCase();
  return NORDSTROM_CHECKOUT_URL_HINTS.some((h) => path.includes(h));
}

function findNordstromCheckoutButton() {
  return (
    document.querySelector("button[type='submit'][data-testid='place-order-button']") ||
    document.querySelector("button[data-testid='checkout-submit-button']") ||
    [...document.querySelectorAll("button, a[role='button'], input[type='submit']")].find((node) =>
      /^(place order|continue|submit order|review order|check out)$/i.test(
        normalizeWhitespace(node.textContent || node.value || ""),
      ),
    ) ||
    null
  );
}

export function initNordstromCheckoutPayFlow() {
  if (!location.hostname.includes("nordstrom.com")) return;
  initRetailerCheckoutPayFlow({
    retailerName: "Nordstrom",
    payRoute: "nordstrom",
    sessionPrefix: NORDSTROM_SESSION_PREFIX,
    isCheckoutPage: isNordstromCheckoutPage,
    findCheckoutButton: findNordstromCheckoutButton,
    getCartSnapshot: () => extractNordstromCartSnapshot(document),
    fillHubShippingFields: fillHubShippingFieldsByAutocomplete,
  });
}
