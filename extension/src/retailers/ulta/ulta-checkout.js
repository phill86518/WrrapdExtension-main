import { initRetailerCheckoutPayFlow } from "../../shared/retailer-checkout-pay-flow.js";
import { fillAndLockHubShippingFields } from "../../shared/wrrapd-hub.js";
import { ULTA_CHECKOUT_URL_HINTS, ULTA_SESSION_PREFIX } from "./constants.js";
import { extractUltaCartSnapshot } from "./retailer-bootstrap.js";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isUltaPayGatePage() {
  const path = location.pathname.toLowerCase();
  return ULTA_CHECKOUT_URL_HINTS.some((h) => path.includes(h));
}

function findUltaCheckoutButtons() {
  /** @type {HTMLElement[]} */
  const buttons = [];
  const seen = new Set();

  const add = (node) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    buttons.push(node);
  };

  for (const sel of [".CartActions__CheckoutButton", ".CartActions button"]) {
    document.querySelectorAll(sel).forEach(add);
  }

  for (const node of document.querySelectorAll("button, a[role='button'], input[type='submit']")) {
    const text = normalizeWhitespace(node.textContent || node.value || "");
    if (
      /^(checkout|continue as guest|continue|place order|proceed to checkout|review order)$/i.test(text)
    ) {
      add(node);
    }
  }

  return buttons;
}

function findUltaCheckoutButton() {
  return findUltaCheckoutButtons()[0] || null;
}

function findUltaSummaryMountAnchor() {
  const checkoutBtn =
    document.querySelector(".CartActions__CheckoutButton") ||
    document.querySelector(".CartActions button");
  if (checkoutBtn) {
    const actions = checkoutBtn.closest(".CartActions");
    if (actions?.parentElement) return { parent: actions.parentElement, before: actions };
    if (checkoutBtn.parentElement) return { parent: checkoutBtn.parentElement, before: checkoutBtn };
  }
  const summary = document.querySelector(".OrderSummary");
  if (summary?.parentElement) return { parent: summary.parentElement, before: summary };
  return null;
}

export function initUltaCheckoutPayFlow() {
  if (!location.hostname.includes("ulta.com")) return;
  initRetailerCheckoutPayFlow({
    retailerName: "Ulta",
    payRoute: "ulta",
    sessionPrefix: ULTA_SESSION_PREFIX,
    isCheckoutPage: isUltaPayGatePage,
    findCheckoutButton: findUltaCheckoutButton,
    findGatedCheckoutButtons: findUltaCheckoutButtons,
    findSummaryMountAnchor: findUltaSummaryMountAnchor,
    getCartSnapshot: () => extractUltaCartSnapshot(document),
    fillHubShippingFields: fillAndLockHubShippingFields,
    paymentPendingHint: "Please complete payment to Wrrapd before proceeding to checkout.",
  });
}
