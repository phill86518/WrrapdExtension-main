import { initNordstromRetailerBootstrap } from "../retailers/nordstrom/retailer-bootstrap.js";
import { initNordstromCheckoutPayFlow } from "../retailers/nordstrom/nordstrom-checkout.js";

if (typeof window !== "undefined") {
  window.__WRRAPD_NORDSTROM_CONTENT_BUILD__ = "2026-06-10-full-checkout";
  initNordstromRetailerBootstrap();
  initNordstromCheckoutPayFlow();
}
