import { initTargetRetailerBootstrap } from "../retailers/target/retailer-bootstrap.js";
import { initTargetCheckoutPayFlow } from "../retailers/target/target-checkout.js";

if (typeof window !== "undefined") {
  window.__WRRAPD_TARGET_CONTENT_BUILD__ = "2026-06-15-target-cart-sync-v1";
  initTargetRetailerBootstrap();
  initTargetCheckoutPayFlow();
}
