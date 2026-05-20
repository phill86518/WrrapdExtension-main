import {
  SHIPPING_TIER_SINGLE,
  describeTierForUi,
} from "../../content/retailer-common.js";
import { WRRAPD_RETAILER_SEPHORA } from "./constants.js";

export function initSephoraRetailerBootstrap() {
  window.__WRRAPD_SEPHORA_DEBUG__ = {
    retailer: WRRAPD_RETAILER_SEPHORA,
    href: window.location.href,
    shippingTier: SHIPPING_TIER_SINGLE,
    shippingTierHint: describeTierForUi(SHIPPING_TIER_SINGLE),
    sampledAt: new Date().toISOString(),
  };
}
