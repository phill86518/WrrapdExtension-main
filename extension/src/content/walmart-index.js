import { startRetailerOrderCapture } from "../shared/retailer-order-capture.js";
import { exposeBuildTag } from "../shared/store-build.js";
import { initWalmartRetailerBootstrap } from "../retailers/walmart/retailer-bootstrap.js";
import { initWalmartCheckoutPayFlow } from "../retailers/walmart/walmart-checkout.js";

if (typeof window !== "undefined") {
  startRetailerOrderCapture("walmart");
  exposeBuildTag("__WRRAPD_WALMART_CONTENT_BUILD__", "2026-06-15-store-prep-v1");
  initWalmartRetailerBootstrap();
  initWalmartCheckoutPayFlow();
}
