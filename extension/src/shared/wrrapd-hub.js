/**
 * Canonical Wrrapd U.S. hub ship-to.
 *
 * Retailers that use the "ship to hub → Wrrapd wraps → Wrrapd ships to giftee"
 * model auto-fill this address into the retailer's own shipping form. Keep in
 * sync with the LEGO copy in src/retailers/lego/constants.js (WRRAPD_HUB_*).
 */
export const WRRAPD_HUB_SHIP_LINES = [
  "WRRAPD INC",
  "PO BOX 26067",
  "JACKSONVILLE FL 32226-6067",
];

export const WRRAPD_HUB_ADDRESS = Object.freeze({
  organization: "WRRAPD INC",
  recipientFirstName: "WRRAPD",
  recipientLastName: "INC",
  addressLine1: "PO BOX 26067",
  addressLine2: "",
  city: "JACKSONVILLE",
  state: "FL",
  postalCode: "32226-6067",
  country: "US",
});

const HUB_LOCK_ATTR = "data-wrrapd-hub-locked";

const SHIPPING_FIELD_SELECTORS = [
  '[autocomplete="given-name"]',
  '[autocomplete="shipping given-name"]',
  '[autocomplete="family-name"]',
  '[autocomplete="shipping family-name"]',
  '[autocomplete="name"]',
  '[autocomplete="shipping name"]',
  '[autocomplete="organization"]',
  '[autocomplete="address-line1"]',
  '[autocomplete="shipping address-line1"]',
  '[autocomplete="address-line2"]',
  '[autocomplete="shipping address-line2"]',
  '[autocomplete="address-level2"]',
  '[autocomplete="shipping address-level2"]',
  '[autocomplete="address-level1"]',
  '[autocomplete="shipping address-level1"]',
  '[autocomplete="postal-code"]',
  '[autocomplete="shipping postal-code"]',
  '[autocomplete="tel"]',
  '[autocomplete="shipping tel"]',
  "#firstName",
  "#lastName",
  "#avs_input",
  "#postalCode",
  '[data-at="first_name_input"]',
  '[data-at="last_name_input"]',
  '[data-at="street_address_input"]',
  '[data-at="zip_postal_code_input"]',
  '[data-at="phone_number_input"]',
];

/** 5-digit hub ZIP for pricing fallbacks. */
export function hubPostal5() {
  const m = String(WRRAPD_HUB_ADDRESS.postalCode || "").match(/^(\d{5})/);
  return m ? m[1] : "32226";
}

/** Hub as a pay.wrrapd.com `address` (billing) object. */
export function hubAsPaymentAddress() {
  const h = WRRAPD_HUB_ADDRESS;
  return {
    name: `${h.recipientFirstName} ${h.recipientLastName}`.trim(),
    street: h.addressLine1,
    city: h.city,
    state: h.state,
    postalCode: h.postalCode,
    country: "United States",
    phone: "",
  };
}

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

function lockShippingField(el) {
  if (!el || el.getAttribute(HUB_LOCK_ATTR) === "1") return;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
    return;
  }
  el.setAttribute(HUB_LOCK_ATTR, "1");
  el.dataset.wrrapdPrevReadonly = el.readOnly ? "1" : "0";
  el.dataset.wrrapdPrevDisabled = el.disabled ? "1" : "0";
  el.dataset.wrrapdPrevPointerEvents = el.style.pointerEvents || "";
  el.dataset.wrrapdPrevBackground = el.style.backgroundColor || "";
  el.readOnly = true;
  if (el.tagName === "SELECT") el.disabled = true;
  el.style.pointerEvents = "none";
  el.style.backgroundColor = "#f3f4f6";
  el.title = "Locked to Wrrapd hub address while gift-wrapping is selected.";
}

/** Re-enable shipping inputs that Wrrapd locked. */
export function unlockHubShippingFields() {
  for (const el of document.querySelectorAll(`[${HUB_LOCK_ATTR}]`)) {
    el.removeAttribute(HUB_LOCK_ATTR);
    el.readOnly = el.dataset.wrrapdPrevReadonly === "1";
    if (el.tagName === "SELECT") {
      el.disabled = el.dataset.wrrapdPrevDisabled === "1";
    }
    el.style.pointerEvents = el.dataset.wrrapdPrevPointerEvents || "";
    el.style.backgroundColor = el.dataset.wrrapdPrevBackground || "";
    el.removeAttribute("title");
    delete el.dataset.wrrapdPrevReadonly;
    delete el.dataset.wrrapdPrevDisabled;
    delete el.dataset.wrrapdPrevPointerEvents;
    delete el.dataset.wrrapdPrevBackground;
  }
}

/** Lock known retailer shipping inputs so shoppers cannot edit the hub address. */
export function lockHubShippingFields(root = document) {
  const seen = new Set();
  for (const sel of SHIPPING_FIELD_SELECTORS) {
    for (const el of root.querySelectorAll(sel)) {
      if (seen.has(el)) continue;
      seen.add(el);
      lockShippingField(el);
    }
  }
}

/**
 * Best-effort hub-address autofill using standard HTML autocomplete tokens.
 * Works on most checkout forms even without retailer-specific selectors.
 * Returns the number of fields filled.
 *
 * @param {{ overwrite?: boolean }} [options]
 */
export function fillHubShippingFieldsByAutocomplete(options = {}) {
  const overwrite = options.overwrite === true;
  const h = WRRAPD_HUB_ADDRESS;
  const zip5 = String(h.postalCode || "").replace(/\D/g, "").slice(0, 5);
  const pairs = [
    ['[autocomplete="given-name"]', h.recipientFirstName],
    ['[autocomplete="shipping given-name"]', h.recipientFirstName],
    ['[autocomplete="family-name"]', h.recipientLastName],
    ['[autocomplete="shipping family-name"]', h.recipientLastName],
    ['[autocomplete="organization"]', h.organization],
    ['[autocomplete="address-line1"]', h.addressLine1],
    ['[autocomplete="shipping address-line1"]', h.addressLine1],
    ['[autocomplete="address-level2"]', h.city],
    ['[autocomplete="shipping address-level2"]', h.city],
    ['[autocomplete="address-level1"]', h.state],
    ['[autocomplete="shipping address-level1"]', h.state],
    ['[autocomplete="postal-code"]', zip5],
    ['[autocomplete="shipping postal-code"]', zip5],
  ];
  let filled = 0;
  for (const [sel, val] of pairs) {
    if (!val) continue;
    const el = document.querySelector(sel);
    if (!el) continue;
    if (el.tagName === "SELECT") {
      const opt = [...el.options].find(
        (o) =>
          String(o.value).toUpperCase() === String(val).toUpperCase() ||
          (o.textContent || "").trim().toUpperCase() === String(val).toUpperCase(),
      );
      if (opt) {
        el.value = opt.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        filled++;
      }
    } else if (overwrite || !el.value || !el.value.trim()) {
      setNativeInputValue(el, val);
      filled++;
    }
  }
  return filled;
}

/** Fill hub address into the retailer form, then lock shipping fields. */
export function fillAndLockHubShippingFields(options = {}) {
  fillHubShippingFieldsByAutocomplete(options);
  lockHubShippingFields();
}
