export const WRRAPD_RETAILER_LEGO = "Lego";

/** DOM marker on the injected hub-address card (idempotent mount). */
export const LEGO_HUB_SHIP_HINT_DATA_ATTR = "data-wrrapd-lego-hub-ship-hint";

/** DOM marker on the “hub vs giftee” explainer on LEGO checkout review / final step. */
export const LEGO_FINAL_DELIVERY_MSG_DATA_ATTR = "data-wrrapd-lego-final-delivery";

/** Bag page: checkbox block above Checkout Securely. */
export const LEGO_GIFT_CART_OPTIN_DATA_ATTR = "data-wrrapd-lego-cart-gift-optin";

/** Checkout shipping: “step 0” Wrrapd gift pitch above “1. Shipping”. */
export const LEGO_GIFT_CHECKOUT_STEP0_DATA_ATTR = "data-wrrapd-lego-checkout-step0";

/** sessionStorage key: `cart-yes` | `dismissed-step0` | unset */
export const LEGO_GIFT_INTENT_SESSION_KEY = "wrrapdLegoGiftIntent";

/**
 * Canonical Wrrapd hub ship-to lines (US), aligned with Amazon ingest hints.
 * Display as a block; guests paste into LEGO shipping fields.
 */
export const WRRAPD_HUB_SHIP_LINES = [
  "WRRAPD INC",
  "PO BOX 26067",
  "JACKSONVILLE FL 32226-6067",
];

/** Structured hub ship-to for programmatic fill on retailer checkout forms. */
export const WRRAPD_HUB_ADDRESS_OBJECT = {
  organization: "WRRAPD INC",
  /** Shown as recipient first / last name when LEGO has no company-only path. */
  recipientFirstName: "WRRAPD",
  recipientLastName: "INC",
  addressLine1: "PO BOX 26067",
  city: "JACKSONVILLE",
  state: "FL",
  postalCode: "32226-6067",
  country: "US",
};

export const LEGO_CHECKOUT_URL_HINTS = ["/checkout", "/checkouts", "/cart"];

export const LEGO_CHECKOUT_CTA_PATTERNS = [
  /checkout/i,
  /continue to payment/i,
  /place order/i,
  /guest checkout/i,
];
