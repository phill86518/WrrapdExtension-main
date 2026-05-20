import {
  SHIPPING_TIER_SINGLE,
  describeTierForUi,
} from "../../content/retailer-common.js";
import { WRRAPD_RETAILER_WALMART } from "./constants.js";

export function initWalmartRetailerBootstrap() {
  window.__WRRAPD_WALMART_DEBUG__ = {
    retailer: WRRAPD_RETAILER_WALMART,
    href: window.location.href,
    shippingTier: SHIPPING_TIER_SINGLE,
    shippingTierHint: describeTierForUi(SHIPPING_TIER_SINGLE),
    sampledAt: new Date().toISOString(),
  };
}
