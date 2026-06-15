import { exposeBuildTag } from "../shared/store-build.js";
import { initUltaRetailerBootstrap } from "../retailers/ulta/retailer-bootstrap.js";
import { initUltaCheckoutPayFlow } from "../retailers/ulta/ulta-checkout.js";

if (typeof window !== "undefined") {
  exposeBuildTag("__WRRAPD_ULTA_CONTENT_BUILD__", "2026-06-15-store-prep-v1");
  initUltaRetailerBootstrap();
  initUltaCheckoutPayFlow();
}
