import { exposeBuildTag } from "../shared/store-build.js";
import { initSephoraRetailerBootstrap } from "../retailers/sephora/retailer-bootstrap.js";
import { initSephoraCheckoutPayFlow } from "../retailers/sephora/sephora-checkout.js";

if (typeof window !== "undefined") {
  exposeBuildTag("__WRRAPD_SEPHORA_CONTENT_BUILD__", "2026-06-15-store-prep-v1");
  initSephoraRetailerBootstrap();
  initSephoraCheckoutPayFlow();
}
