import { exposeBuildTag } from "../shared/store-build.js";
import { initLegoGuestCheckoutBootstrap } from "../retailers/lego/guest-checkout-bootstrap.js";

/** Lego.com entrypoint — isolated from Amazon/Target bundles. */
if (typeof window !== "undefined") {
  exposeBuildTag("__WRRAPD_LEGO_CONTENT_BUILD__", "2026-06-15-store-prep-v1");
  initLegoGuestCheckoutBootstrap();
}
