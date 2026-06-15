import { initBestbuyRetailerBootstrap } from "../retailers/bestbuy/retailer-bootstrap.js";
import { initBestbuyCheckoutPayFlow } from "../retailers/bestbuy/bestbuy-checkout.js";

if (typeof window !== "undefined") {
  window.__WRRAPD_BESTBUY_CONTENT_BUILD__ = "2026-06-15-bestbuy-empty-cart-v1";
  initBestbuyRetailerBootstrap();
  initBestbuyCheckoutPayFlow();
}
