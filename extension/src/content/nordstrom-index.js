import { exposeBuildTag } from "../shared/store-build.js";
import { initNordstromRetailerBootstrap } from "../retailers/nordstrom/retailer-bootstrap.js";
import { initNordstromCheckoutPayFlow } from "../retailers/nordstrom/nordstrom-checkout.js";

if (typeof window !== "undefined") {
  exposeBuildTag("__WRRAPD_NORDSTROM_CONTENT_BUILD__", "2026-06-15-store-prep-v1");
  initNordstromRetailerBootstrap();
  initNordstromCheckoutPayFlow();
}
