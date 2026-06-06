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
