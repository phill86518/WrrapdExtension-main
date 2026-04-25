import {
  LEGO_CHECKOUT_CTA_PATTERNS,
  LEGO_CHECKOUT_URL_HINTS,
  LEGO_GIFT_RADIO_SESSION_KEY,
  LEGO_GIFT_TC_SESSION_KEY,
  WRRAPD_RETAILER_LEGO,
} from "./constants.js";
import { initLegoCheckoutFinalDeliveryMessage } from "./checkout-final-delivery-message.js";
import { initLegoGiftWrapUpsell } from "./lego-gift-wrap-upsell.js";
import { isLegoCheckoutReviewLikePage } from "./lego-checkout-review-detect.js";
import { initLegoShippingDeliveryHint } from "./lego-shipping-overlay.js";

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
  let giftRadio = "";
  let giftTcAccepted = false;
  try {
    giftRadio = sessionStorage.getItem(LEGO_GIFT_RADIO_SESSION_KEY) || "";
    giftTcAccepted = sessionStorage.getItem(LEGO_GIFT_TC_SESSION_KEY) === "1";
  } catch {
    giftRadio = "";
    giftTcAccepted = false;
  }

  window.__WRRAPD_LEGO_DEBUG__ = {
    retailer: WRRAPD_RETAILER_LEGO,
    href,
    isCheckoutLike,
    checkoutReviewLike: isLegoCheckoutReviewLikePage(),
    giftRadio,
    giftTcAccepted,
    ctaFound: cta.found,
    ctaText: cta.text,
    sampledAt: new Date().toISOString(),
  };

  initLegoCheckoutFinalDeliveryMessage();
  initLegoGiftWrapUpsell();
  initLegoShippingDeliveryHint();
}
