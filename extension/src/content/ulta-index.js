import { initUltaRetailerBootstrap } from "../retailers/ulta/retailer-bootstrap.js";
import { initUltaCheckoutPayFlow } from "../retailers/ulta/ulta-checkout.js";

if (typeof window !== "undefined") {
  window.__WRRAPD_ULTA_CONTENT_BUILD__ = "2026-06-15-ulta-pay-gate-v1";
  initUltaRetailerBootstrap();
  initUltaCheckoutPayFlow();
}
