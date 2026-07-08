import { initRetailerCheckoutPayFlow } from "../../shared/retailer-checkout-pay-flow.js";
import { WRRAPD_HUB_ADDRESS, lockHubShippingFields } from "../../shared/wrrapd-hub.js";
import {
  SEPHORA_BASKET_URL_HINTS,
  SEPHORA_CHECKOUT_URL_HINTS,
  SEPHORA_SESSION_PREFIX,
} from "./constants.js";
import { extractSephoraCartSnapshot } from "./retailer-bootstrap.js";

/** Phone shown to the retailer for hub delivery questions (Sephora requires a phone). */
const HUB_PHONE = "904-204-0617";

const SEPHORA_PAY_SLOT_ID = "wrrapd-sephora-pay-slot";

function setNativeInputValue(input, value) {
  if (!input || value == null) return;
  const str = String(value);
  const proto = Object.getPrototypeOf(input);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  const setter = desc && desc.set;
  if (setter) setter.call(input, str);
  else input.value = str;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("blur", { bubbles: true }));
}

/** Basket + checkout: gate "Checkout" on the basket page and place-order on checkout. */
function isSephoraPayGatePage() {
  const path = location.pathname.toLowerCase();
  return (
    SEPHORA_BASKET_URL_HINTS.some((h) => path.includes(h)) ||
    SEPHORA_CHECKOUT_URL_HINTS.some((h) => path.includes(h))
  );
}

function findSephoraCheckoutButtons() {
  /** @type {HTMLElement[]} */
  const buttons = [];
  const seen = new Set();
  const add = (node) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    buttons.push(node);
  };
  for (const sel of [
    '[data-at="basket_checkout_btn"]',
    '[data-at="place_order_btn"]',
    '[data-at="save_continue_btn"]',
  ]) {
    document.querySelectorAll(sel).forEach(add);
  }
  return buttons;
}

function findSephoraCheckoutButton() {
  return findSephoraCheckoutButtons()[0] || null;
}

function findSephoraSummaryMountAnchor() {
  const basketBtn = document.querySelector('[data-at="basket_checkout_btn"]');
  if (basketBtn?.parentElement) {
    return { parent: basketBtn.parentElement, before: basketBtn };
  }

  let slot = document.getElementById(SEPHORA_PAY_SLOT_ID);
  if (slot && !slot.isConnected) slot = null;

  if (!slot) {
    const main =
      document.querySelector("main") ||
      document.querySelector("[role='main']") ||
      document.body;
    slot = document.createElement("div");
    slot.id = SEPHORA_PAY_SLOT_ID;
    slot.setAttribute("data-wrrapd-sephora-pay-slot", "1");
    slot.style.cssText = "box-sizing:border-box;width:100%;max-width:100%;margin:0 0 8px;";
    main.insertBefore(slot, main.firstElementChild);
  }

  return { parent: slot, before: null };
}

/**
 * Auto-fill Sephora's "Deliver To" shipping form with the Wrrapd hub address.
 * Sephora derives city/state from the street + ZIP via address verification,
 * so we only set the fields the form actually exposes.
 */
function fillSephoraHubShippingFields() {
  const h = WRRAPD_HUB_ADDRESS;
  const zip5 = String(h.postalCode || "").replace(/\D/g, "").slice(0, 5);

  const first = document.querySelector('[data-at="first_name_input"], #firstName');
  const last = document.querySelector('[data-at="last_name_input"], #lastName');
  const phone = document.querySelector('[data-at="phone_number_input"], #phone');
  const street = document.querySelector('[data-at="street_address_input"], #avs_input');
  const zip = document.querySelector('[data-at="zip_postal_code_input"], #postalCode');

  if (first) setNativeInputValue(first, h.recipientFirstName);
  if (last) setNativeInputValue(last, h.recipientLastName);
  if (phone) setNativeInputValue(phone, HUB_PHONE);
  if (street) setNativeInputValue(street, h.addressLine1);
  if (zip) setNativeInputValue(zip, zip5);
  lockHubShippingFields();
}

export function initSephoraCheckoutPayFlow() {
  if (!location.hostname.includes("sephora.com")) return;
  initRetailerCheckoutPayFlow({
    retailerName: "Sephora",
    payRoute: "sephora",
    sessionPrefix: SEPHORA_SESSION_PREFIX,
    isCheckoutPage: isSephoraPayGatePage,
    findCheckoutButton: findSephoraCheckoutButton,
    findGatedCheckoutButtons: findSephoraCheckoutButtons,
    findSummaryMountAnchor: findSephoraSummaryMountAnchor,
    getCartSnapshot: () => extractSephoraCartSnapshot(document),
    fillHubShippingFields: fillSephoraHubShippingFields,
    paymentPendingHint: "Please complete payment to Wrrapd before proceeding to checkout.",
  });
}
