/**
 * Wrrapd conflict guard.
 *
 * Retailers with physical stores (Target, Walmart, Best Buy, Nordstrom,
 * Kohl's, Sephora, Ulta) let the shopper pick *store pickup*, same-day
 * delivery, or a different shipping address. Those conflict with Wrrapd:
 * items must ship to the Wrrapd hub to be gift-wrapped.
 *
 * When the shopper chooses Wrrapd (radio === "yes"):
 *   • Hide pickup / same-day / drive-up / curbside fulfillment controls
 *   • Prefer standard shipping when a shipping radio exists
 *   • Intercept trusted clicks on conflicting controls with a confirm modal
 *
 * When they switch to "No thanks…", restore those retailer options.
 *
 * Not used for Amazon or Etsy — neither has in-store pickup on our cart UI.
 */

import { createWrrapdBrandLogo } from "./wrrapd-brand.js";
import {
  clearGiftServiceFlags,
  notifyGiftRadioChange,
  readGiftRadio,
  writeGiftRadio,
  writePaymentSuccess,
  WRRAPD_GIFT_RADIO_CHANGE_EVENT,
} from "./cart-gift-session.js";
import {
  fillAndLockHubShippingFields,
  unlockHubShippingFields,
} from "./wrrapd-hub.js";

const MODAL_ATTR = "data-wrrapd-conflict-modal";
const PICKUP_LOCK_ATTR = "data-wrrapd-pickup-locked";
const PICKUP_BADGE_ATTR = "data-wrrapd-pickup-badge";

/** Non-shipping fulfillment the shopper must not use while Wrrapd is selected. */
const DEFAULT_PICKUP_PATTERNS = [
  /\border\s*pickup\b/i,
  /\bstore\s*pickup\b/i,
  /\bfree\s*store\s*pickup\b/i,
  /\bin[-\s]?store\s*pickup\b/i,
  /\bpick\s*up\s*(in[-\s]?store|at\s*store|in\s*store|today|here)\b/i,
  /\bpick\s*up\s*at\b/i,
  /\bpickup only\b/i,
  /\bpick\s*up only\b/i,
  /\bonly available for (store )?pick\s*up\b/i,
  /\bonly available for pickup\b/i,
  /\bin[-\s]?store only\b/i,
  /\bdrive\s*up\b/i,
  /\bcurbside\b/i,
  /\bship\s*to\s*store\b/i,
  /\bsame\s*day\s*delivery\b/i,
  /\bsameday\s*delivery\b/i,
  /\bget it (as soon as|today|tomorrow)\b/i,
  /\bready (today|tomorrow|in\s*\d)\b/i,
  /\bchange store\b/i,
];

const DEFAULT_ADDRESS_PATTERNS = [
  /\bship\s*to\s*a?\s*different\s*address\b/i,
  /\buse\s*a?\s*different\s*(shipping\s*)?address\b/i,
  /\badd\s*(a\s*|an\s*)?new\s*(shipping\s*)?address\b/i,
  /\badd\s*(a\s*|an\s*)?address\b/i,
  /\bdeliver\s*to\s*a?\s*different\s*address\b/i,
  /\benter\s*a?\s*(new|different)\s*address\b/i,
  /\bchange\s*(the\s*)?shipping\s*address\b/i,
  /\bedit\s*(the\s*)?shipping\s*address\b/i,
];

/** Default CSS selectors for non-shipping fulfillment blocks (Target + common). */
const DEFAULT_HIDE_SELECTORS = [
  '[data-test="InStoreFulfillment"]',
  '[data-test="sameDayDeliveryRadioInput"]',
  '[data-test="changeStoreLink"]',
  '[data-testid*="pickup" i]',
  '[data-testid*="Pickup" i]',
  '[data-test*="pickup" i]',
  '[data-test*="Pickup" i]',
  '[data-test*="sameDay" i]',
  '[data-test*="SameDay" i]',
  '[data-testid*="sameDay" i]',
  '[data-testid*="SameDay" i]',
];

const DEFAULT_PREFER_SHIPPING_SELECTORS = [
  '[data-test="ShippingFulfillment"] input[type="radio"]',
  'input[type="radio"][value="STANDARD"]',
  'input[type="radio"][value="shipping" i]',
  'input[type="radio"][value*="SHIP" i]',
  'input[type="radio"][id*="shipping" i]',
];

/** Whether the shopper has actively chosen Wrrapd for this order. */
function wrrapdSelected(prefix) {
  return readGiftRadio(prefix) === "yes";
}

function normText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

/** Find the closest interactive control around the click target. */
function closestControl(node) {
  let el = node;
  for (let i = 0; i < 8 && el && el !== document.body; i += 1) {
    if (
      typeof el.matches === "function" &&
      el.matches(
        'button, a[href], [role="radio"], [role="button"], [role="tab"], [role="option"], label, input[type="radio"], [data-test*="fulfillment" i], [data-test*="pickup" i], [data-test*="sameDay" i]',
      )
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/** Compact label blob for matching (prefer short attrs over huge subtree text). */
function controlText(el) {
  if (!el) return "";
  const parts = [
    el.getAttribute?.("aria-label"),
    el.getAttribute?.("data-test"),
    el.getAttribute?.("data-testid"),
    el.getAttribute?.("value"),
    el.getAttribute?.("title"),
  ];
  if (el.tagName === "INPUT") {
    const id = el.getAttribute("id");
    if (id) {
      try {
        const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lab) {
          parts.push(lab.getAttribute("aria-label"));
          // First line / short slice only — full label trees are huge on Target.
          parts.push(normText(lab.textContent).slice(0, 120));
        }
      } catch {
        /* ignore */
      }
    }
    const wrapLabel = el.closest("label");
    if (wrapLabel) parts.push(normText(wrapLabel.textContent).slice(0, 120));
  } else {
    parts.push(normText(el.textContent).slice(0, 120));
  }
  return normText(parts.filter(Boolean).join(" "));
}

function matchesAny(text, patterns) {
  if (!text) return false;
  return patterns.some((re) => re.test(text));
}

function looksLikeShippingOnly(text) {
  if (!text) return false;
  if (/\bsame\s*day\b/i.test(text)) return false;
  if (/\bpick\s*up\b|\bpickup\b|\bdrive\s*up\b|\bcurbside\b/i.test(text)) return false;
  return /\bshipping\b|\bship\b|\bdeliver(y|ed)?\b|\barriving\b|\bstandard\b/i.test(text);
}

/** @returns {"pickup"|"address"|null} */
function classifyConflict(el, pickupPatterns, addressPatterns) {
  const text = controlText(el);
  if (!text) return null;
  if (looksLikeShippingOnly(text) && !matchesAny(text, pickupPatterns)) return null;
  if (matchesAny(text, pickupPatterns)) return "pickup";
  if (matchesAny(text, addressPatterns)) return "address";
  return null;
}

function buildModal(config, kind, onConfirm, onCancel) {
  const retailer = config.retailerLabel || "this store";

  const overlay = document.createElement("div");
  overlay.setAttribute(MODAL_ATTR, "1");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;" +
    "background:rgba(15,23,42,.55);padding:18px;";

  const card = document.createElement("div");
  card.setAttribute("role", "alertdialog");
  card.setAttribute("aria-modal", "true");
  card.style.cssText =
    "box-sizing:border-box;width:100%;max-width:440px;background:#fff;border-radius:14px;" +
    "border-top:5px solid #ff8e14;box-shadow:0 18px 48px rgba(0,0,0,.32);padding:22px 22px 18px;" +
    "font-family:inherit;color:#111827;";

  const brandRow = document.createElement("div");
  brandRow.style.cssText = "display:flex;align-items:center;gap:10px;margin:0 0 12px;";
  brandRow.append(createWrrapdBrandLogo(40));

  const heading = document.createElement("h2");
  heading.style.cssText = "margin:0 0 8px;font-size:18px;font-weight:800;line-height:1.3;";
  const body = document.createElement("p");
  body.style.cssText = "margin:0 0 18px;font-size:14px;line-height:1.55;color:#374151;";

  if (kind === "pickup") {
    heading.textContent = "Pickup & same-day aren't available with Wrrapd";
    body.innerHTML =
      "You've chosen <strong>Wrrapd gift-wrapping</strong> for this order. " +
      `Your items must ship to the Wrrapd studio to be wrapped, so they can't use store pickup or same-day delivery at ${retailer}. ` +
      "Switching will <strong>remove your Wrrapd gift-wrapping</strong> and set this order to ship unwrapped. Continue?";
  } else {
    heading.textContent = "Shipping address is locked to Wrrapd";
    body.innerHTML =
      "You've chosen <strong>Wrrapd gift-wrapping</strong> for this order, so it must ship to the Wrrapd studio first. " +
      "Entering a different shipping address will <strong>remove your Wrrapd gift-wrapping</strong> and ship this order unwrapped. Continue?";
  }

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;";

  const keepBtn = document.createElement("button");
  keepBtn.type = "button";
  keepBtn.textContent = "Keep Wrrapd gift-wrapping";
  keepBtn.style.cssText =
    "flex:1 1 auto;min-width:160px;padding:11px 14px;border:none;border-radius:9px;cursor:pointer;" +
    "background:#ff8e14;color:#fff;font-size:14px;font-weight:700;";

  const switchBtn = document.createElement("button");
  switchBtn.type = "button";
  switchBtn.textContent = kind === "pickup" ? "Switch away from Wrrapd" : "Use a different address";
  switchBtn.style.cssText =
    "flex:0 0 auto;padding:11px 14px;border:1px solid #cbd5e1;border-radius:9px;cursor:pointer;" +
    "background:#fff;color:#374151;font-size:14px;font-weight:600;";

  const close = (cb) => {
    overlay.remove();
    document.removeEventListener("keydown", onKey, true);
    cb?.();
  };
  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      close(onCancel);
    }
  }

  keepBtn.addEventListener("click", () => close(onCancel));
  switchBtn.addEventListener("click", () => close(onConfirm));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close(onCancel);
  });
  document.addEventListener("keydown", onKey, true);

  btnRow.append(switchBtn, keepBtn);
  card.append(brandRow, heading, body, btnRow);
  overlay.append(card);
  (document.body || document.documentElement).append(overlay);
  keepBtn.focus();
}

/** Switch the Wrrapd opt-in to "No thanks, …" and tear down the gift flow. */
function switchToNoThanks(config) {
  const prefix = config.sessionPrefix;
  writeGiftRadio(prefix, "no");
  clearGiftServiceFlags(prefix);
  writePaymentSuccess(prefix, false);
  notifyGiftRadioChange(prefix);
  unlockHubShippingFields();

  try {
    const yes = document.querySelector(`input[name="${prefix}-gift"][value="yes"]`);
    const no = document.querySelector(`input[name="${prefix}-gift"][value="no"]`);
    if (yes) yes.checked = false;
    if (no) no.checked = true;
    if (config.savedBannerAttr) {
      document
        .querySelectorAll(`[${config.savedBannerAttr}]`)
        .forEach((el) => el.remove());
    }
  } catch {
    /* ignore */
  }
}

/** Hide a fulfillment control entirely while Wrrapd is selected. */
function lockPickupControl(el) {
  if (!el || el.hasAttribute(PICKUP_LOCK_ATTR)) return;
  // Prefer the option row / radio wrapper so the whole choice disappears.
  const lockEl =
    el.closest?.(
      '[data-test="InStoreFulfillment"], [data-test="sameDayDeliveryRadioInput"], [data-test*="pickup" i], [data-test*="Pickup" i], [data-test*="sameDay" i], [data-testid*="pickup" i], [data-testid*="sameDay" i], .styles_ndsRadio__vxxVc, [class*="fulfillment"]',
    ) || el;
  if (lockEl.hasAttribute?.(PICKUP_LOCK_ATTR)) return;

  lockEl.setAttribute(PICKUP_LOCK_ATTR, "1");
  lockEl.dataset.wrrapdPrevCss = lockEl.style.cssText || "";
  lockEl.dataset.wrrapdPrevHidden = lockEl.hidden ? "1" : "0";
  lockEl.dataset.wrrapdPrevDisplay = lockEl.style.display || "";
  lockEl.style.setProperty("display", "none", "important");
  lockEl.hidden = true;
  lockEl.setAttribute("aria-hidden", "true");
  lockEl.setAttribute("aria-disabled", "true");
  lockEl.title =
    "Unavailable while Wrrapd gift-wrapping is selected — items ship to the Wrrapd studio first.";
}

function unlockPickupControl(el) {
  if (!el) return;
  el.removeAttribute(PICKUP_LOCK_ATTR);
  el.style.cssText = el.dataset.wrrapdPrevCss || "";
  el.style.display = el.dataset.wrrapdPrevDisplay || "";
  el.hidden = el.dataset.wrrapdPrevHidden === "1";
  delete el.dataset.wrrapdPrevCss;
  delete el.dataset.wrrapdPrevDisplay;
  delete el.dataset.wrrapdPrevHidden;
  el.removeAttribute("aria-disabled");
  el.removeAttribute("aria-hidden");
  el.removeAttribute("title");
  el.querySelectorAll?.(`[${PICKUP_BADGE_ATTR}]`).forEach((b) => b.remove());
}

function looksLikeCheckoutPage(config) {
  if (typeof config.isCheckoutPage === "function") return config.isCheckoutPage();
  const path = location.pathname.toLowerCase();
  return /checkout|\/bag\/|\/basket\/|order-review|\/shipping/.test(path);
}

function applyShippingAddressLock(config) {
  const selected = wrrapdSelected(config.sessionPrefix);
  if (!selected) {
    unlockHubShippingFields();
    return;
  }
  if (!looksLikeCheckoutPage(config)) return;
  fillAndLockHubShippingFields({ overwrite: true });
}

/**
 * Find non-shipping fulfillment UI to hide (pickup, same-day, drive-up, etc.).
 * Never hides standard shipping controls.
 */
function findPickupControls(pickupPatterns, hideSelectors) {
  const out = [];
  const seen = new Set();
  const push = (el) => {
    if (!el || seen.has(el)) return;
    if (el.closest(`[${MODAL_ATTR}]`)) return;
    if (el.closest(`[data-wrrapd-target-cart-gift-optin], [data-wrrapd-pay-summary-host]`)) return;
    // Never hide shipping-only rows.
    const text = controlText(el);
    if (looksLikeShippingOnly(text) && !matchesAny(text, pickupPatterns)) return;
    if (el.matches?.('[data-test="ShippingFulfillment"], [data-test*="ShippingFulfillment"]')) return;
    seen.add(el);
    out.push(el);
  };

  for (const sel of hideSelectors || []) {
    try {
      document.querySelectorAll(sel).forEach(push);
    } catch {
      /* ignore bad selector */
    }
  }

  const candidates = document.querySelectorAll(
    [
      "button",
      "label",
      'a[role="button"]',
      '[role="radio"]',
      '[role="tab"]',
      '[role="option"]',
      'input[type="radio"]',
      '[data-test*="fulfillment" i]',
      '[data-test*="pickup" i]',
      '[data-test*="Pickup" i]',
      '[data-test*="sameDay" i]',
      '[data-test*="SameDay" i]',
      '[data-testid*="pickup" i]',
      '[data-testid*="sameDay" i]',
    ].join(", "),
  );
  for (const el of candidates) {
    if (seen.has(el)) continue;
    if (el.closest(`[${MODAL_ATTR}]`)) continue;
    const text = controlText(el);
    if (!matchesAny(text, pickupPatterns)) continue;
    if (looksLikeShippingOnly(text)) continue;
    push(el);
  }
  return out;
}

/** When Wrrapd is on, switch the cart to standard shipping if pickup/same-day is selected. */
let lastShipPreferAt = 0;
function preferShippingFulfillment(config) {
  const now = Date.now();
  if (now - lastShipPreferAt < 2000) return;

  const nonShipChecked = document.querySelector(
    [
      '[data-test="InStoreFulfillment"] input[type="radio"]:checked',
      '[data-test="sameDayDeliveryRadioInput"] input[type="radio"]:checked',
      'input[type="radio"][value="STORE_PICKUP"]:checked',
      'input[type="radio"][value="Same Day Delivery"]:checked',
      'input[type="radio"][id*="instore"]:checked',
      'input[type="radio"][id*="same-day"]:checked',
      'input[type="radio"][id*="pickup"]:checked',
    ].join(", "),
  );
  // If nothing non-shipping is selected, don't spam shipping clicks.
  if (!nonShipChecked) {
    const shippingAlready = document.querySelector(
      '[data-test="ShippingFulfillment"] input[type="radio"]:checked, input[type="radio"][value="STANDARD"]:checked',
    );
    if (shippingAlready) return;
  }

  const selectors = config.preferShippingSelectors || DEFAULT_PREFER_SHIPPING_SELECTORS;
  for (const sel of selectors) {
    try {
      const input = document.querySelector(sel);
      if (!(input instanceof HTMLInputElement)) continue;
      if (input.disabled) continue;
      if (input.checked) return;
      lastShipPreferAt = now;
      // Untrusted click — conflict guard ignores non-trusted events.
      input.click();
      return;
    } catch {
      /* ignore */
    }
  }
}

function applyPickupLock(config, pickupPatterns, hideSelectors) {
  const selected = wrrapdSelected(config.sessionPrefix);
  if (!selected) {
    document.querySelectorAll(`[${PICKUP_LOCK_ATTR}]`).forEach(unlockPickupControl);
    applyShippingAddressLock(config);
    return;
  }
  for (const el of findPickupControls(pickupPatterns, hideSelectors)) {
    lockPickupControl(el);
  }
  preferShippingFulfillment(config);
  applyShippingAddressLock(config);
}

/**
 * @param {object} config
 * @param {string} config.sessionPrefix
 * @param {string} [config.retailerLabel]
 * @param {string} [config.savedBannerAttr]
 * @param {RegExp[]} [config.pickupPatterns]
 * @param {RegExp[]} [config.addressPatterns]
 * @param {string[]} [config.hideSelectors]  CSS selectors to hide when Wrrapd is yes
 * @param {string[]} [config.preferShippingSelectors]
 */
export function initWrrapdConflictGuard(config) {
  if (!config?.sessionPrefix) return;

  const pickupPatterns = config.pickupPatterns || DEFAULT_PICKUP_PATTERNS;
  const addressPatterns = config.addressPatterns || DEFAULT_ADDRESS_PATTERNS;
  const hideSelectors = config.hideSelectors || DEFAULT_HIDE_SELECTORS;

  let scheduled = 0;
  const scheduleLock = () => {
    if (scheduled) cancelAnimationFrame(scheduled);
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      applyPickupLock(config, pickupPatterns, hideSelectors);
    });
  };
  scheduleLock();
  try {
    new MutationObserver(scheduleLock).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  } catch {
    /* ignore */
  }
  window.addEventListener(WRRAPD_GIFT_RADIO_CHANGE_EVENT, scheduleLock);

  const onClick = (e) => {
    if (!e.isTrusted) return;
    if (!wrrapdSelected(config.sessionPrefix)) return;

    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest(`[${MODAL_ATTR}]`)) return;
    if (document.querySelector(`[${MODAL_ATTR}]`)) return;

    const control = closestControl(target);
    if (!control) return;

    const kind = classifyConflict(control, pickupPatterns, addressPatterns);
    if (!kind) return;

    const ariaState =
      control.getAttribute?.("aria-checked") === "true" ||
      control.getAttribute?.("aria-selected") === "true" ||
      (control.tagName === "INPUT" && control.checked);
    if (kind === "pickup" && ariaState) return;

    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();

    buildModal(
      config,
      kind,
      () => {
        switchToNoThanks(config);
        setTimeout(() => {
          try {
            control.click();
          } catch {
            /* ignore */
          }
        }, 0);
      },
      () => {
        /* keep Wrrapd */
      },
    );
  };

  document.addEventListener("click", onClick, true);
}
