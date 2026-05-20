import {
  SHIPPING_TIER_SINGLE,
  describeTierForUi,
} from "../../content/retailer-common.js";
import { WRRAPD_RETAILER_ETSY } from "./constants.js";

export function initEtsyRetailerBootstrap() {
  window.__WRRAPD_ETSY_DEBUG__ = {
    retailer: WRRAPD_RETAILER_ETSY,
    href: window.location.href,
    shippingTier: SHIPPING_TIER_SINGLE,
    shippingTierHint: describeTierForUi(SHIPPING_TIER_SINGLE),
    sampledAt: new Date().toISOString(),
  };
}
