/**
 * Wrrapd conflict guard.
 *
 * Retailers with physical stores (Target, Walmart, Best Buy, Nordstrom,
 * Kohl's, Sephora, Ulta) let the shopper pick *store pickup* or set a
 * different shipping address. Either choice conflicts with Wrrapd: the item
 * must physically arrive at the Wrrapd hub to be gift-wrapped, so it can be
 * neither picked up in-store nor shipped to another address.
 *
 * When the shopper has chosen Wrrapd (radio === "yes") and then clicks a
 * pickup control — or a "ship to a different / new address" control — we
 * intercept that genuine click (capture phase + `e.isTrusted`), warn them,
 * and:
 *   • Confirm  → switch the Wrrapd radio to "No thanks, …" and re-fire their
 *                original click so the retailer flow proceeds.
 *   • Cancel   → keep Wrrapd selected; the original click never happens.
 *
 * Using `e.isTrusted` means our own programmatic hub-address autofill (which
 * produces untrusted synthetic clicks) is never blocked by this guard.
 *
 * Not used for Amazon or Etsy — neither has in-store pickup.
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

const MODAL_ATTR = "data-wrrapd-conflict-modal";
const PICKUP_LOCK_ATTR = "data-wrrapd-pickup-locked";
const PICKUP_BADGE_ATTR = "data-wrrapd-pickup-badge";

const DEFAULT_PICKUP_PATTERNS = [
  /\border\s*pickup\b/i,
  /\bstore\s*pickup\b/i,
  /\bfree\s*store\s*pickup\b/i,
  /\bin[-\s]?store\s*pickup\b/i,
  /\bpick\s*up\s*(in[-\s]?store|at\s*store|in\s*store|today|here)\b/i,
  /\bpick\s*up\s*at\b/i,
  /\bdrive\s*up\b/i,
  /\bcurbside\b/i,
  /\bship\s*to\s*store\b/i,
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
        'button, a[href], [role="radio"], [role="button"], [role="tab"], [role="option"], label, input[type="radio"], [data-test*="fulfillment" i], [data-test*="pickup" i]',
      )
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/** Gather the user-visible text/labels associated with a control. */
function controlText(el) {
  if (!el) return "";
  const parts = [
    el.getAttribute?.("aria-label"),
    el.getAttribute?.("data-test"),
    el.getAttribute?.("value"),
    el.getAttribute?.("title"),
    el.textContent,
  ];
  if (el.tagName === "INPUT") {
    const id = el.getAttribute("id");
    if (id) {
      try {
        const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lab) parts.push(lab.textContent);
      } catch {
        /* ignore */
      }
    }
    const wrapLabel = el.closest("label");
    if (wrapLabel) parts.push(wrapLabel.textContent);
  }
  return normText(parts.filter(Boolean).join(" "));
}

function matchesAny(text, patterns) {
  if (!text || text.length > 160) return false;
  return patterns.some((re) => re.test(text));
}

/** @returns {"pickup"|"address"|null} */
function classifyConflict(el, pickupPatterns, addressPatterns) {
  const text = controlText(el);
  if (!text) return null;
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
    "font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;";

  const brandRow = document.createElement("div");
  brandRow.style.cssText = "display:flex;align-items:center;gap:8px;margin:0 0 12px;";
  brandRow.append(createWrrapdBrandLogo(24));

  const heading = document.createElement("h2");
  heading.style.cssText = "margin:0 0 8px;font-size:18px;font-weight:800;line-height:1.3;";
  const body = document.createElement("p");
  body.style.cssText = "margin:0 0 18px;font-size:14px;line-height:1.55;color:#374151;";

  if (kind === "pickup") {
    heading.textContent = "Pickup isn't available with Wrrapd";
    body.innerHTML =
      "You've chosen <strong>Wrrapd gift-wrapping</strong> for this order. " +
      `Your items must ship to the Wrrapd studio to be wrapped, so they can't be picked up at a ${retailer} store. ` +
      "Switching to pickup will <strong>remove your Wrrapd gift-wrapping</strong> and set this order to ship unwrapped. Continue?";
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
  switchBtn.textContent = kind === "pickup" ? "Switch to store pickup" : "Use a different address";
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

/** Visually disable a detected pickup control while Wrrapd is selected. */
function lockPickupControl(el) {
  if (!el || el.hasAttribute(PICKUP_LOCK_ATTR)) return;
  el.setAttribute(PICKUP_LOCK_ATTR, "1");
  el.dataset.wrrapdPrevCss = el.style.cssText || "";
  el.style.opacity = "0.45";
  el.style.pointerEvents = "none";
  el.style.cursor = "not-allowed";
  el.setAttribute("aria-disabled", "true");
  el.title = "Unavailable while Wrrapd gift-wrapping is selected — items ship to the Wrrapd studio first.";

  try {
    const badge = document.createElement("span");
    badge.setAttribute(PICKUP_BADGE_ATTR, "1");
    badge.textContent = "Unavailable with Wrrapd";
    badge.style.cssText =
      "display:inline-block;margin-left:8px;padding:1px 7px;border-radius:9px;background:#fff3e0;" +
      "color:#b45309;font-size:11px;font-weight:700;border:1px solid #fcd34d;vertical-align:middle;";
    el.appendChild(badge);
  } catch {
    /* ignore */
  }
}

function unlockPickupControl(el) {
  if (!el) return;
  el.removeAttribute(PICKUP_LOCK_ATTR);
  el.style.cssText = el.dataset.wrrapdPrevCss || "";
  delete el.dataset.wrrapdPrevCss;
  el.removeAttribute("aria-disabled");
  el.removeAttribute("title");
  el.querySelectorAll?.(`[${PICKUP_BADGE_ATTR}]`).forEach((b) => b.remove());
}

/** Find the outermost selectable pickup controls on the page. */
function findPickupControls(pickupPatterns) {
  const out = [];
  const seen = new Set();
  const candidates = document.querySelectorAll(
    'button, label, a[role="button"], [role="radio"], [role="tab"], [role="option"], [data-test*="pickup" i], [data-testid*="pickup" i]',
  );
  for (const el of candidates) {
    if (seen.has(el)) continue;
    if (el.closest(`[${MODAL_ATTR}]`)) continue;
    const text = controlText(el);
    if (!matchesAny(text, pickupPatterns)) continue;
    // Skip if an ancestor we'll also lock already matches (lock the outer one only).
    const outer = el.closest(`[${PICKUP_LOCK_ATTR}]`);
    if (outer && outer !== el) continue;
    seen.add(el);
    out.push(el);
  }
  return out;
}

function applyPickupLock(config, pickupPatterns) {
  const selected = wrrapdSelected(config.sessionPrefix);
  if (!selected) {
    document.querySelectorAll(`[${PICKUP_LOCK_ATTR}]`).forEach(unlockPickupControl);
    return;
  }
  for (const el of findPickupControls(pickupPatterns)) lockPickupControl(el);
}

/**
 * @param {object} config
 * @param {string} config.sessionPrefix
 * @param {string} [config.retailerLabel]
 * @param {string} [config.savedBannerAttr]
 * @param {RegExp[]} [config.pickupPatterns]
 * @param {RegExp[]} [config.addressPatterns]
 */
export function initWrrapdConflictGuard(config) {
  if (!config?.sessionPrefix) return;

  const pickupPatterns = config.pickupPatterns || DEFAULT_PICKUP_PATTERNS;
  const addressPatterns = config.addressPatterns || DEFAULT_ADDRESS_PATTERNS;

  // Visually disable pickup options whenever Wrrapd is selected, re-applying as the
  // retailer's SPA re-renders. The click guard below remains a backstop.
  let scheduled = 0;
  const scheduleLock = () => {
    if (scheduled) cancelAnimationFrame(scheduled);
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      applyPickupLock(config, pickupPatterns);
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
    // Only genuine user clicks. Our own autofill fires untrusted clicks.
    if (!e.isTrusted) return;
    if (!wrrapdSelected(config.sessionPrefix)) return;

    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest(`[${MODAL_ATTR}]`)) return; // ignore clicks inside our modal
    if (document.querySelector(`[${MODAL_ATTR}]`)) return; // a modal is already open

    const control = closestControl(target);
    if (!control) return;

    const kind = classifyConflict(control, pickupPatterns, addressPatterns);
    if (!kind) return;

    // A control already in the selected/active state shouldn't re-warn.
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
        // Confirmed: drop Wrrapd, then re-fire the original (untrusted → allowed).
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
        /* Cancelled: keep Wrrapd, original action never happened. */
      },
    );
  };

  document.addEventListener("click", onClick, true);
}
