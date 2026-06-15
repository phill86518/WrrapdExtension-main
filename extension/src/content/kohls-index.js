import { exposeBuildTag } from "../shared/store-build.js";
import { initKohlsRetailerBootstrap } from "../retailers/kohls/retailer-bootstrap.js";
import { initKohlsCheckoutPayFlow } from "../retailers/kohls/kohls-checkout.js";

if (typeof window !== "undefined") {
  exposeBuildTag("__WRRAPD_KOHLS_CONTENT_BUILD__", "2026-06-15-store-prep-v1");
  initKohlsRetailerBootstrap();
  initKohlsCheckoutPayFlow();
}
