import { startRetailerOrderCapture } from "../shared/retailer-order-capture.js";
import { exposeBuildTag } from "../shared/store-build.js";
import { initTargetRetailerBootstrap } from "../retailers/target/retailer-bootstrap.js";
import { initTargetCheckoutPayFlow } from "../retailers/target/target-checkout.js";

if (typeof window !== "undefined") {
  startRetailerOrderCapture("target");
  exposeBuildTag("__WRRAPD_TARGET_CONTENT_BUILD__", "2026-06-15-store-prep-v1");
  initTargetRetailerBootstrap();
  initTargetCheckoutPayFlow();
}
