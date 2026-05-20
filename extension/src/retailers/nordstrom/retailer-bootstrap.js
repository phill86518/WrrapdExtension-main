import {
  SHIPPING_TIER_SINGLE,
  describeTierForUi,
} from "../../content/retailer-common.js";
import { WRRAPD_RETAILER_NORDSTROM } from "./constants.js";

export function initNordstromRetailerBootstrap() {
  window.__WRRAPD_NORDSTROM_DEBUG__ = {
    retailer: WRRAPD_RETAILER_NORDSTROM,
    href: window.location.href,
    shippingTier: SHIPPING_TIER_SINGLE,
    shippingTierHint: describeTierForUi(SHIPPING_TIER_SINGLE),
    sampledAt: new Date().toISOString(),
  };
}
