import { LEGO_SHIPPING_OVERLAY_SEEN_KEY } from "./constants.js";
import { isLegoCheckoutReviewLikePage } from "./lego-checkout-review-detect.js";
import { readGiftChoicesSaved, readGiftLegalTermsAccepted } from "./lego-session-state.js";

const OVERLAY_ID = "wrrapd-lego-shipping-hint-overlay";

function giftPathReadyForShippingHint() {
  return readGiftChoicesSaved() && readGiftLegalTermsAccepted();
}

function readSeen() {
  try {
    return sessionStorage.getItem(LEGO_SHIPPING_OVERLAY_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSeen() {
  try {
    sessionStorage.setItem(LEGO_SHIPPING_OVERLAY_SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

function findShippingStepHeadline() {
  const main =
    document.getElementById("main-content") ||
    document.querySelector("main[role='main']") ||
    document.querySelector("main");
  if (!main) return null;
  for (const el of main.querySelectorAll("h1, h2, h3")) {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (/^1[\s.)-]*shipping\b/i.test(t)) return el;
  }
  return null;
}

function tryMountShippingHint() {
  const path = (window.location.pathname || "").toLowerCase();
  const isCheckout =
    path.includes("/checkout") || path.includes("/checkouts");
  if (!isCheckout || isLegoCheckoutReviewLikePage()) return;
  if (!giftPathReadyForShippingHint() || readSeen()) return;
  if (!findShippingStepHeadline()) return;
  if (document.getElementById(OVERLAY_ID)) return;

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "wrrapd-lego-ship-hint-title");
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483645",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:var(--ds-spacing-md, 1rem)",
    "background:rgba(15,23,42,0.72)",
    "box-sizing:border-box",
  ].join(";");

  const panel = document.createElement("div");
  panel.style.cssText = [
    "max-width:22rem",
    "width:100%",
    "box-sizing:border-box",
    "padding:var(--ds-spacing-md, 1rem)",
    "border-radius:var(--ds-border-radius-md, 0.5rem)",
    "background:var(--ds-color-layer-neutral-default, #fff)",
    "box-shadow:var(--ds-shadow-deep-md, 0 8px 24px rgba(0,0,0,.2))",
  ].join(";");

  const title = document.createElement("h2");
  title.id = "wrrapd-lego-ship-hint-title";
  title.className = "ds-heading-sm ds-color-text-default";
  title.style.margin = "0 0 var(--ds-spacing-xs, 0.5rem) 0";
  title.textContent = "A quick note on timing";

  const p = document.createElement("p");
  p.className = "ds-body-xs-regular ds-color-text-default";
  p.style.margin = "0 0 var(--ds-spacing-sm, 0.75rem) 0";
  p.textContent =
    "Because your set may spend a short time with Wrrapd for gift wrap before it travels to your giftee, delivery can occasionally take about one extra business day after LEGO ships to us. Thank you for your patience.";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "sk-button sk-button--primary sk-button--small sk-button--neutral";
  btn.textContent = "Continue";

  const close = () => {
    writeSeen();
    window.removeEventListener("keydown", onKey);
    overlay.remove();
  };

  const onKey = (e) => {
    if (e.key === "Escape") close();
  };

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  btn.addEventListener("click", close);
  window.addEventListener("keydown", onKey);

  panel.append(title, p, btn);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  btn.focus();
}

/**
 * After guest has opted into Wrrapd gift services, one-time gentle overlay on LEGO shipping.
 */
export function initLegoShippingDeliveryHint() {
  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      tryMountShippingHint();
    });
  };

  tryMountShippingHint();
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", schedule);
}
