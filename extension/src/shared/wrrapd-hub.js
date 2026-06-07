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

/**
 * Best-effort hub-address autofill using standard HTML autocomplete tokens.
 * Works on most checkout forms even without retailer-specific selectors.
 * Returns the number of fields filled.
 */
export function fillHubShippingFieldsByAutocomplete() {
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
    } else if (!el.value || !el.value.trim()) {
      setNativeInputValue(el, val);
      filled++;
    }
  }
  return filled;
}
