import { initSephoraRetailerBootstrap } from "../retailers/sephora/retailer-bootstrap.js";
import { initSephoraCheckoutPayFlow } from "../retailers/sephora/sephora-checkout.js";

if (typeof window !== "undefined") {
  window.__WRRAPD_SEPHORA_CONTENT_BUILD__ = "2026-06-06-full-checkout";
  initSephoraRetailerBootstrap();
  initSephoraCheckoutPayFlow();
}
