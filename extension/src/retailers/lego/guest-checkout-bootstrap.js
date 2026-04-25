import {
  LEGO_CHECKOUT_CTA_PATTERNS,
  LEGO_CHECKOUT_URL_HINTS,
  WRRAPD_RETAILER_LEGO,
} from "./constants.js";

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
  window.__WRRAPD_LEGO_DEBUG__ = {
    retailer: WRRAPD_RETAILER_LEGO,
    href,
    isCheckoutLike,
    ctaFound: cta.found,
    ctaText: cta.text,
    sampledAt: new Date().toISOString(),
  };
}
