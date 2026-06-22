import { exposeBuildTag } from "../shared/store-build.js";
import { initKohlsRetailerBootstrap } from "../retailers/kohls/retailer-bootstrap.js";
import { initKohlsCheckoutPayFlow } from "../retailers/kohls/kohls-checkout.js";

if (typeof window !== "undefined") {
  // Injection proof — fires the instant content-kohls.js is evaluated, BEFORE any page scraping
  // that could throw. The window global survives store builds (`--drop:console`), so on any
  // kohls.com tab `window.__WRRAPD_HEARTBEAT__["Kohl's"]` tells you the script injected and which
  // version. If it's `undefined`, Chrome never injected the script (reload the unpacked extension
  // and hard-refresh the tab) — it is NOT a mount/scrape bug.
  try {
    const version =
      (typeof chrome !== "undefined" && chrome.runtime?.getManifest?.().version) || "?";
    const beats = (window.__WRRAPD_HEARTBEAT__ = window.__WRRAPD_HEARTBEAT__ || {});
    if (!beats["Kohl's"]) {
      beats["Kohl's"] = version;
      // eslint-disable-next-line no-console
      console.info(
        `%c[Wrrapd]%c v${version} injected on kohls.com — initializing`,
        "color:#ff8e14;font-weight:700",
        "color:inherit",
      );
    }
  } catch {
    /* never let diagnostics block init */
  }

  exposeBuildTag("__WRRAPD_KOHLS_CONTENT_BUILD__", "2026-06-15-store-prep-v1");
  try {
    initKohlsRetailerBootstrap();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[Wrrapd] Kohl's cart bootstrap failed — Wrrapd panel will not mount:", err);
  }
  try {
    initKohlsCheckoutPayFlow();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[Wrrapd] Kohl's checkout pay-flow failed:", err);
  }
}
