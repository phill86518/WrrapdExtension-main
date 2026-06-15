import { exposeBuildTag } from "../shared/store-build.js";
import { initBestbuyRetailerBootstrap } from "../retailers/bestbuy/retailer-bootstrap.js";
import { initBestbuyCheckoutPayFlow } from "../retailers/bestbuy/bestbuy-checkout.js";

if (typeof window !== "undefined") {
  exposeBuildTag("__WRRAPD_BESTBUY_CONTENT_BUILD__", "2026-06-15-store-prep-v1");
  initBestbuyRetailerBootstrap();
  initBestbuyCheckoutPayFlow();
}
