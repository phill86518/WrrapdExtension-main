import { exposeBuildTag } from "../shared/store-build.js";
import { initBestbuyRetailerBootstrap } from "../retailers/bestbuy/retailer-bootstrap.js";
import { initBestbuyCheckoutPayFlow } from "../retailers/bestbuy/bestbuy-checkout.js";

if (typeof window !== "undefined") {
  // Injection proof — fires before any scraping. `window.__WRRAPD_HEARTBEAT__["Best Buy"]`
  // confirms the content script injected and its version even in store builds.
  try {
    const version =
      (typeof chrome !== "undefined" && chrome.runtime?.getManifest?.().version) || "?";
    const beats = (window.__WRRAPD_HEARTBEAT__ = window.__WRRAPD_HEARTBEAT__ || {});
    if (!beats["Best Buy"]) {
      beats["Best Buy"] = version;
      // eslint-disable-next-line no-console
      console.info(
        `%c[Wrrapd]%c v${version} injected on bestbuy.com — initializing`,
        "color:#ff8e14;font-weight:700",
        "color:inherit",
      );
    }
  } catch {
    /* never let diagnostics block init */
  }

  exposeBuildTag("__WRRAPD_BESTBUY_CONTENT_BUILD__", "2026-06-15-store-prep-v1");
  try {
    initBestbuyRetailerBootstrap();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[Wrrapd] Best Buy cart bootstrap failed — Wrrapd panel will not mount:", err);
  }
  try {
    initBestbuyCheckoutPayFlow();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[Wrrapd] Best Buy checkout pay-flow failed:", err);
  }
}
