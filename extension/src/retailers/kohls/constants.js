export const WRRAPD_RETAILER_KOHLS = "kohls";
export const KOHLS_SESSION_PREFIX = "wrrapdKohls";
export const KOHLS_CART_OPTIN_DATA_ATTR = "data-wrrapd-kohls-cart-gift-optin";
export const KOHLS_SAVED_BANNER_ATTR = "data-wrrapd-kohls-gift-saved";
export const KOHLS_GIFT_MODAL_ID = "wrrapd-kohls-gift-modal";
/** Live bag URL is typically /checkout/shopping_cart.jsp (not /cart). */
export const KOHLS_CART_URL_HINTS = [
  "shopping_cart",
  "shopping-cart",
  "/cart",
  "shopping-bag",
  "shopping_bag",
  "viewshoppingbag",
];
/** Cart + checkout: Wrrapd payment is gated on both. */
export const KOHLS_CHECKOUT_URL_HINTS = [
  "shopping_cart",
  "shopping-cart",
  "/cart",
  "shopping-bag",
  "shopping_bag",
  "viewshoppingbag",
  "/checkout",
];
