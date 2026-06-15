import { initWalmartRetailerBootstrap } from "../retailers/walmart/retailer-bootstrap.js";
import { initWalmartCheckoutPayFlow } from "../retailers/walmart/walmart-checkout.js";

if (typeof window !== "undefined") {
  window.__WRRAPD_WALMART_CONTENT_BUILD__ = "2026-06-10-walmart-optout-pay";
  initWalmartRetailerBootstrap();
  initWalmartCheckoutPayFlow();
}
