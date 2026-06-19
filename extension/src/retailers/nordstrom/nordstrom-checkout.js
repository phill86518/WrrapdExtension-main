import { initRetailerCheckoutPayFlow } from "../../shared/retailer-checkout-pay-flow.js";
import { fillHubShippingFieldsByAutocomplete } from "../../shared/wrrapd-hub.js";
import {
  NORDSTROM_CART_URL_HINTS,
  NORDSTROM_CHECKOUT_URL_HINTS,
  NORDSTROM_SESSION_PREFIX,
} from "./constants.js";
import { extractNordstromCartSnapshot } from "./retailer-bootstrap.js";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

/** Shopping bag + checkout: gate "Check Out" on the bag page and place-order on checkout. */
function isNordstromPayGatePage() {
  const path = location.pathname.toLowerCase();
  return (
    NORDSTROM_CART_URL_HINTS.some((h) => path.includes(h)) ||
    NORDSTROM_CHECKOUT_URL_HINTS.some((h) => path.includes(h))
  );
}

function findNordstromCheckoutButtons() {
  /** @type {HTMLElement[]} */
  const buttons = [];
  const seen = new Set();

  const add = (node) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    buttons.push(node);
  };

  for (const sel of [
    "a[href='/checkout']",
    "button[type='submit'][data-testid='place-order-button']",
    "button[data-testid='checkout-submit-button']",
  ]) {
    document.querySelectorAll(sel).forEach(add);
  }

  for (const node of document.querySelectorAll("button, a[role='button'], input[type='submit'], a[href='/checkout']")) {
    const text = normalizeWhitespace(node.textContent || node.value || "");
    if (/^(check out|checkout|place order|submit order|review order)$/i.test(text)) add(node);
  }

  return buttons;
}

function findNordstromCheckoutButton() {
  return findNordstromCheckoutButtons()[0] || null;
}

const NORDSTROM_PAY_SLOT_ID = "wrrapd-nordstrom-checkout-pay-slot";

/**
 * Mount Wrrapd payment above the bag "Check Out" link or at the top of checkout
 * so customers pay Wrrapd before Nordstrom payment / Review Order.
 */
function findNordstromSummaryMountAnchor() {
  const checkoutLink = document.querySelector("a[href='/checkout']");
  if (checkoutLink) {
    const block = checkoutLink.closest("div");
    if (block?.parentElement) {
      return { parent: block.parentElement, before: block };
    }
    if (checkoutLink.parentElement) {
      return { parent: checkoutLink.parentElement, before: checkoutLink };
    }
  }

  let slot = document.getElementById(NORDSTROM_PAY_SLOT_ID);
  if (slot && !slot.isConnected) slot = null;

  if (!slot) {
    const main =
      document.querySelector("main") ||
      document.querySelector("[role='main']") ||
      document.querySelector("[data-testid='checkout-page']") ||
      document.body;
    slot = document.createElement("div");
    slot.id = NORDSTROM_PAY_SLOT_ID;
    slot.setAttribute("data-wrrapd-nordstrom-pay-slot", "1");
    slot.style.cssText = "box-sizing:border-box;width:100%;max-width:100%;margin:0 0 8px;";
    main.insertBefore(slot, main.firstElementChild);
  }

  return { parent: slot, before: null };
}

export function initNordstromCheckoutPayFlow() {
  if (!location.hostname.includes("nordstrom.com")) return;
  initRetailerCheckoutPayFlow({
    retailerName: "Nordstrom",
    payRoute: "nordstrom",
    sessionPrefix: NORDSTROM_SESSION_PREFIX,
    isCheckoutPage: isNordstromPayGatePage,
    findCheckoutButton: findNordstromCheckoutButton,
    findGatedCheckoutButtons: findNordstromCheckoutButtons,
    findSummaryMountAnchor: findNordstromSummaryMountAnchor,
    getCartSnapshot: () => extractNordstromCartSnapshot(document),
    fillHubShippingFields: fillHubShippingFieldsByAutocomplete,
    paymentPendingHint: "Please complete payment to Wrrapd before proceeding to checkout.",
  });
}
