import { initLegoGuestCheckoutBootstrap } from "../retailers/lego/guest-checkout-bootstrap.js";

/**
 * Lego.com entrypoint.
 * Keep retailer-specific logic isolated from Amazon/Target bundles.
 */
if (typeof window !== "undefined") {
  window.__WRRAPD_LEGO_CONTENT_BUILD__ = "2026-04-25-lego-gift-upsell";
  initLegoGuestCheckoutBootstrap();
}
