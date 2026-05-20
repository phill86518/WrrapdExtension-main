import {
  SHIPPING_TIER_SINGLE,
  describeTierForUi,
} from "../../content/retailer-common.js";
import { WRRAPD_RETAILER_ULTA } from "./constants.js";

/**
 * Phase-1 Ulta bootstrap: confirms bundle load + exposes diagnostics for DOM tuning.
 */
export function initUltaRetailerBootstrap() {
  window.__WRRAPD_ULTA_DEBUG__ = {
    retailer: WRRAPD_RETAILER_ULTA,
    href: window.location.href,
    shippingTier: SHIPPING_TIER_SINGLE,
    shippingTierHint: describeTierForUi(SHIPPING_TIER_SINGLE),
    sampledAt: new Date().toISOString(),
  };
}
