import { initRetailerCheckoutPayFlow } from "../../shared/retailer-checkout-pay-flow.js";
import { fillHubShippingFieldsByAutocomplete } from "../../shared/wrrapd-hub.js";
import {
  BESTBUY_CHECKOUT_URL_HINTS,
  BESTBUY_SESSION_PREFIX,
} from "./constants.js";
import {
  findBestbuyCartMountAnchor,
  getBestbuyCartSnapshotSafe,
} from "./retailer-bootstrap.js";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isBestbuyPayGatePage() {
  const path = location.pathname.toLowerCase();
  return BESTBUY_CHECKOUT_URL_HINTS.some((h) => path.includes(h));
}

function findBestbuyCheckoutButtons() {
  /** @type {HTMLElement[]} */
  const buttons = [];
  const seen = new Set();

  const add = (node) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    buttons.push(node);
  };

  for (const sel of [
    ".checkout-buttons__checkout button",
    "button[data-track*='Checkout']",
    "[data-track='checkout']",
    "button[data-testid='checkout-button']",
    "a[data-track='checkout']",
    "a[href*='/checkout/r/']",
  ]) {
    document.querySelectorAll(sel).forEach(add);
  }

  for (const node of document.querySelectorAll(
    "button, a[role='button'], a.btn-primary, input[type='submit']",
  )) {
    const text = normalizeWhitespace(node.textContent || node.value || "");
    if (/^(checkout|continue to checkout|place order|continue)$/i.test(text)) add(node);
  }

  return buttons;
}

function findBestbuyCheckoutButton() {
  return findBestbuyCheckoutButtons()[0] || null;
}

function findBestbuySummaryMountAnchor() {
  return findBestbuyCartMountAnchor();
}

export function initBestbuyCheckoutPayFlow() {
  if (!location.hostname.includes("bestbuy.com")) return;
  initRetailerCheckoutPayFlow({
    retailerName: "Best Buy",
    payRoute: "bestbuy",
    sessionPrefix: BESTBUY_SESSION_PREFIX,
    isCheckoutPage: isBestbuyPayGatePage,
    findCheckoutButton: findBestbuyCheckoutButton,
    findGatedCheckoutButtons: findBestbuyCheckoutButtons,
    findSummaryMountAnchor: findBestbuySummaryMountAnchor,
    getCartSnapshot: () => getBestbuyCartSnapshotSafe(document),
    fillHubShippingFields: fillHubShippingFieldsByAutocomplete,
    paymentPendingHint: "Please complete payment to Wrrapd before proceeding to checkout.",
  });
}
