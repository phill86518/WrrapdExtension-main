import { initEtsyRetailerBootstrap } from "../retailers/etsy/retailer-bootstrap.js";
import { initEtsyCheckoutPayFlow } from "../retailers/etsy/etsy-checkout.js";

if (typeof window !== "undefined") {
  window.__WRRAPD_ETSY_CONTENT_BUILD__ = "2026-06-07-full-checkout";
  initEtsyRetailerBootstrap();
  initEtsyCheckoutPayFlow();
}
