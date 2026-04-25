export const WRRAPD_RETAILER_LEGO = "Lego";

/** DOM marker on the injected hub-address card (idempotent mount). */
export const LEGO_HUB_SHIP_HINT_DATA_ATTR = "data-wrrapd-lego-hub-ship-hint";

/** DOM marker on the “hub vs giftee” explainer on LEGO checkout review / final step. */
export const LEGO_FINAL_DELIVERY_MSG_DATA_ATTR = "data-wrrapd-lego-final-delivery";

/** Bag page: checkbox block above Checkout Securely. */
export const LEGO_GIFT_CART_OPTIN_DATA_ATTR = "data-wrrapd-lego-cart-gift-optin";

/** Checkout shipping: “step 0” Wrrapd gift pitch above “1. Shipping”. */
export const LEGO_GIFT_CHECKOUT_STEP0_DATA_ATTR = "data-wrrapd-lego-checkout-step0";

/** sessionStorage: bag gift question `yes` | `no` | unset */
export const LEGO_GIFT_RADIO_SESSION_KEY = "wrrapdLegoGiftRadio";

/** sessionStorage: `1` after guest accepts gift-service T&C in LEGO modal */
export const LEGO_GIFT_TC_SESSION_KEY = "wrrapdLegoGiftTcAccepted";

/** sessionStorage: `1` after user dismisses Step 0 “Not now” */
export const LEGO_GIFT_STEP0_DISMISSED_KEY = "wrrapdLegoGiftStep0Dismissed";

/** sessionStorage: optional wrap preference from LEGO modal (`wrrapd` | `classic`) */
export const LEGO_GIFT_WRAP_PREF_KEY = "wrrapdLegoWrapPref";

/** sessionStorage: `1` if guest asked about flowers in LEGO modal */
export const LEGO_GIFT_FLOWERS_INTEREST_KEY = "wrrapdLegoFlowersInterest";

/** sessionStorage: `1` after shipping-step delivery hint overlay dismissed */
export const LEGO_SHIPPING_OVERLAY_SEEN_KEY = "wrrapdLegoShippingHintSeen";

/** @deprecated use LEGO_GIFT_RADIO_SESSION_KEY + LEGO_GIFT_TC_SESSION_KEY */
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
