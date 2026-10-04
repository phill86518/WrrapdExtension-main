import { startRetailerOrderCapture } from "../shared/retailer-order-capture.js";
import { exposeBuildTag } from "../shared/store-build.js";
import { initEtsyRetailerBootstrap } from "../retailers/etsy/retailer-bootstrap.js";
import { initEtsyCheckoutPayFlow } from "../retailers/etsy/etsy-checkout.js";

if (typeof window !== "undefined") {
  startRetailerOrderCapture("etsy");
  exposeBuildTag("__WRRAPD_ETSY_CONTENT_BUILD__", "2026-06-15-store-prep-v1");
  initEtsyRetailerBootstrap();
  initEtsyCheckoutPayFlow();
}
