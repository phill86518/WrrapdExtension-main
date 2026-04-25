import {
  LEGO_CHECKOUT_CTA_PATTERNS,
  LEGO_CHECKOUT_URL_HINTS,
  LEGO_GIFT_INTENT_SESSION_KEY,
  WRRAPD_RETAILER_LEGO,
} from "./constants.js";
import { initLegoCheckoutFinalDeliveryMessage } from "./checkout-final-delivery-message.js";
import { initLegoHubShipAddressHint } from "./hub-ship-address-hint.js";
import { initLegoGiftWrapUpsell } from "./lego-gift-wrap-upsell.js";
import { isLegoCheckoutReviewLikePage } from "./lego-checkout-review-detect.js";

function looksLikeLegoCheckoutUrl(url) {
  const href = String(url || "").toLowerCase();
  return LEGO_CHECKOUT_URL_HINTS.some((hint) => href.includes(hint));
}

function detectGuestCheckoutCta() {
  const nodes = document.querySelectorAll("button, a, [role='button']");
  for (const node of nodes) {
    const text = (node.textContent || "").trim();
    if (!text) continue;
    if (LEGO_CHECKOUT_CTA_PATTERNS.some((re) => re.test(text))) {
      return { found: true, text };
    }
  }
  return { found: false, text: "" };
}

/**
 * Phase-1 Lego bootstrap:
 * - confirms script isolation on lego.com
 * - performs guest-checkout-friendly CTA detection without auth assumptions
 * - exposes lightweight diagnostics in window for DOM tuning sessions
 */
export function initLegoGuestCheckoutBootstrap() {
  const href = window.location.href;
  const isCheckoutLike = looksLikeLegoCheckoutUrl(href);
  const cta = detectGuestCheckoutCta();
  let giftIntent = "";
  try {
    giftIntent = sessionStorage.getItem(LEGO_GIFT_INTENT_SESSION_KEY) || "";
  } catch {
    giftIntent = "";
  }

  window.__WRRAPD_LEGO_DEBUG__ = {
    retailer: WRRAPD_RETAILER_LEGO,
    href,
    isCheckoutLike,
    checkoutReviewLike: isLegoCheckoutReviewLikePage(),
    giftIntent,
    ctaFound: cta.found,
    ctaText: cta.text,
    sampledAt: new Date().toISOString(),
  };

  initLegoHubShipAddressHint();
  initLegoCheckoutFinalDeliveryMessage();
  initLegoGiftWrapUpsell();
}
