import { initKohlsRetailerBootstrap } from "../retailers/kohls/retailer-bootstrap.js";
import { initKohlsCheckoutPayFlow } from "../retailers/kohls/kohls-checkout.js";

if (typeof window !== "undefined") {
  window.__WRRAPD_KOHLS_CONTENT_BUILD__ = "2026-06-15-kohls-pay-gate-v1";
  initKohlsRetailerBootstrap();
  initKohlsCheckoutPayFlow();
}
