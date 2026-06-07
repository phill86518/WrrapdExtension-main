/** Stable retailer id for payloads and logging */
export const WRRAPD_RETAILER_ETSY = "etsy";

/** Prefix for sessionStorage keys */
export const ETSY_SESSION_PREFIX = "wrrapdEtsy";

/** Marker attributes + ids for the cart gift opt-in UI */
export const ETSY_CART_OPTIN_DATA_ATTR = "data-wrrapd-etsy-cart-gift-optin";
export const ETSY_SAVED_BANNER_ATTR = "data-wrrapd-etsy-gift-saved";
export const ETSY_GIFT_MODAL_ID = "wrrapd-etsy-gift-modal";

/** Path hints for the Etsy cart page */
export const ETSY_CART_URL_HINTS = ["/cart"];

/** Path hints for the Etsy checkout/payment page (where Wrrapd payment is gated). */
export const ETSY_CHECKOUT_URL_HINTS = ["/cart", "/cart/payment"];
