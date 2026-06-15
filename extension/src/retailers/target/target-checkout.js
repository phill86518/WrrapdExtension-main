import { initRetailerCheckoutPayFlow } from "../../shared/retailer-checkout-pay-flow.js";
import { fillHubShippingFieldsByAutocomplete } from "../../shared/wrrapd-hub.js";
import {
  TARGET_CHECKOUT_URL_HINTS,
  TARGET_SESSION_PREFIX,
} from "./constants.js";
import { extractTargetCartSnapshot } from "./retailer-bootstrap.js";
import { findTargetWrrapdMountAnchor } from "./target-layout.js";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isTargetPayGatePage() {
  const path = location.pathname.toLowerCase();
  return TARGET_CHECKOUT_URL_HINTS.some((h) => path.includes(h));
}

function findTargetCheckoutButtons() {
  /** @type {HTMLElement[]} */
  const buttons = [];
  const seen = new Set();

  const add = (node) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    buttons.push(node);
  };

  for (const sel of ['[data-test="checkout-button"]', 'a[href*="/checkout"]']) {
    document.querySelectorAll(sel).forEach((node) => {
      if (sel.includes("href") && node instanceof HTMLAnchorElement) {
        const text = normalizeWhitespace(node.textContent || "");
        if (!/check\s*out/i.test(text)) return;
      }
      add(node);
    });
  }

  for (const node of document.querySelectorAll("button, a[role='button'], input[type='submit']")) {
    const text = normalizeWhitespace(node.textContent || node.value || "");
    if (/^(check out|checkout|proceed to checkout)$/i.test(text)) add(node);
  }

  return buttons;
}

function findTargetCheckoutButton() {
  return findTargetCheckoutButtons()[0] || null;
}

function findTargetSummaryMountAnchor() {
  return findTargetWrrapdMountAnchor();
}

export function initTargetCheckoutPayFlow() {
  if (!location.hostname.includes("target.com")) return;
  initRetailerCheckoutPayFlow({
    retailerName: "Target",
    payRoute: "target",
    sessionPrefix: TARGET_SESSION_PREFIX,
    isCheckoutPage: isTargetPayGatePage,
    findCheckoutButton: findTargetCheckoutButton,
    findGatedCheckoutButtons: findTargetCheckoutButtons,
    findSummaryMountAnchor: findTargetSummaryMountAnchor,
    getCartSnapshot: () => extractTargetCartSnapshot(document),
    fillHubShippingFields: fillHubShippingFieldsByAutocomplete,
    paymentPendingHint: "Please complete payment to Wrrapd before proceeding to checkout.",
  });
}
