/** Stable retailer id for payloads and logging */
export const WRRAPD_RETAILER_ULTA = "ulta";

/** Prefix for sessionStorage keys */
export const ULTA_SESSION_PREFIX = "wrrapdUlta";

/** Marker attributes + ids for the cart gift opt-in UI */
export const ULTA_CART_OPTIN_DATA_ATTR = "data-wrrapd-ulta-cart-gift-optin";
export const ULTA_SAVED_BANNER_ATTR = "data-wrrapd-ulta-gift-saved";
export const ULTA_GIFT_MODAL_ID = "wrrapd-ulta-gift-modal";

/** Path hints for the Ulta bag/cart page */
export const ULTA_CART_URL_HINTS = ["/bag"];
/** Bag + checkout: Wrrapd payment is gated on both. */
export const ULTA_CHECKOUT_URL_HINTS = ["/bag", "/checkout"];
