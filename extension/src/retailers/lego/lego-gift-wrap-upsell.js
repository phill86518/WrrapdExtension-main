import {
  LEGO_GIFT_CART_OPTIN_DATA_ATTR,
  LEGO_GIFT_CHECKOUT_STEP0_DATA_ATTR,
  LEGO_GIFT_INTENT_SESSION_KEY,
} from "./constants.js";
import { isLegoCheckoutReviewLikePage } from "./lego-checkout-review-detect.js";

const MODAL_ID = "wrrapd-lego-gift-intro-modal";

function readIntent() {
  try {
    return sessionStorage.getItem(LEGO_GIFT_INTENT_SESSION_KEY) || "";
  } catch {
    return "";
  }
}

function writeIntent(value) {
  try {
    if (!value) sessionStorage.removeItem(LEGO_GIFT_INTENT_SESSION_KEY);
    else sessionStorage.setItem(LEGO_GIFT_INTENT_SESSION_KEY, value);
  } catch {
    /* ignore */
  }
}

function existingCartOptIn() {
  return document.querySelector(`[${LEGO_GIFT_CART_OPTIN_DATA_ATTR}]`);
}

function existingCheckoutStep0() {
  return document.querySelector(`[${LEGO_GIFT_CHECKOUT_STEP0_DATA_ATTR}]`);
}

function findCheckoutSecurelyButton() {
  return (
    document.querySelector('[data-test="checkout-securely-button-desktop"]') ||
    document.querySelector('[data-test="checkout-securely-button-mobile"]') ||
    document.querySelector('[data-test="checkout-securely-button"]') ||
    [...document.querySelectorAll("button")].find((b) =>
      /checkout securely/i.test((b.textContent || "").trim()),
    ) ||
    null
  );
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
  const payBtn = [...main.querySelectorAll("button")].find((b) =>
    /^continue to payment$/i.test((b.textContent || "").replace(/\s+/g, " ").trim()),
  );
  if (payBtn) {
    let n = payBtn;
    for (let i = 0; i < 12 && n; i += 1) {
      const prev = n.previousElementSibling;
      if (prev) {
        const h = prev.querySelector?.("h1, h2, h3") || (prev.matches?.("h1,h2,h3") ? prev : null);
        if (h) return h;
      }
      n = n.parentElement;
    }
  }
  return null;
}

/**
 * Lightweight intro modal (LEGO-adjacent styling). Opens from bag checkbox or checkout step 0.
 */
export function openLegoGiftWrapIntroModal() {
  if (document.getElementById(MODAL_ID)) return;

  const overlay = document.createElement("div");
  overlay.id = MODAL_ID;
  overlay.className = "wrrapd-lego-modal";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "wrrapd-lego-gift-modal-title");
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483646",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:var(--ds-spacing-md, 1rem)",
    "background:rgba(15,23,42,0.55)",
    "box-sizing:border-box",
  ].join(";");

  const panel = document.createElement("div");
  panel.style.cssText = [
    "max-width:28rem",
    "width:100%",
    "box-sizing:border-box",
    "padding:var(--ds-spacing-md, 1rem)",
    "border-radius:var(--ds-border-radius-md, 0.5rem)",
    "background:var(--ds-color-layer-neutral-default, #fff)",
    "box-shadow:var(--ds-shadow-deep-md, 0 8px 24px rgba(0,0,0,.15))",
  ].join(";");

  const title = document.createElement("h2");
  title.id = "wrrapd-lego-gift-modal-title";
  title.className = "ds-heading-sm ds-color-text-default";
  title.style.margin = "0 0 var(--ds-spacing-xs, 0.5rem) 0";
  title.textContent = "LEGO builds the set — Wrrapd builds the moment";

  const p = document.createElement("p");
  p.className = "ds-body-xs-regular ds-color-text-default";
  p.style.margin = "0 0 var(--ds-spacing-sm, 0.75rem) 0";
  p.textContent =
    "LEGO.com does not offer gift wrap. Wrrapd receives your order at our hub, professionally wraps it, and can coordinate extras like flowers. Your giftee’s address is used for the final handoff — not LEGO’s checkout.";

  const row = document.createElement("div");
  row.style.cssText =
    "display:flex;flex-wrap:wrap;gap:var(--ds-spacing-2xs, 0.375rem);justify-content:flex-end;";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className =
    "sk-button sk-button--secondary sk-button--small sk-button--neutral";
  closeBtn.textContent = "Got it";

  const link = document.createElement("a");
  link.className = "sk-button sk-button--primary sk-button--small sk-button--neutral";
  link.href = "https://www.wrrapd.com/";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Explore Wrrapd";

  const tearDown = () => {
    window.removeEventListener("keydown", onKey);
    overlay.remove();
  };

  const onKey = (e) => {
    if (e.key === "Escape") tearDown();
  };

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) tearDown();
  });
  closeBtn.addEventListener("click", tearDown);
  link.addEventListener("click", () => window.setTimeout(tearDown, 0));

  window.addEventListener("keydown", onKey);

  row.append(closeBtn, link);
  panel.append(title, p, row);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  closeBtn.focus();
}

function mountCartGiftOptIn() {
  if (existingCartOptIn()) return;
  const btn = findCheckoutSecurelyButton();
  if (!btn?.parentElement) return;

  const wrap = document.createElement("div");
  wrap.setAttribute(LEGO_GIFT_CART_OPTIN_DATA_ATTR, "1");
  wrap.style.cssText = [
    "box-sizing:border-box",
    "width:100%",
    "margin:0 0 var(--ds-spacing-sm, 0.75rem) 0",
    "padding:var(--ds-spacing-sm, 0.75rem)",
    "background-color:var(--ds-color-layer-neutral-default, #fff)",
    "border-radius:var(--ds-border-radius-md, 0.5rem)",
    "border:1px solid var(--ds-color-border-subdued, #e2e8f0)",
  ].join(";");

  const hook = document.createElement("p");
  hook.className = "ds-label-sm-medium ds-color-text-default";
  hook.style.margin = "0 0 var(--ds-spacing-2xs, 0.375rem) 0";
  hook.textContent = "LEGO doesn’t wrap gifts — we do.";

  const sub = document.createElement("p");
  sub.className = "ds-body-xs-regular ds-color-text-subdued";
  sub.style.margin = "0 0 var(--ds-spacing-xs, 0.5rem) 0";
  sub.textContent =
    "Ship the bricks to Wrrapd; we wrap, ribbon, and route the wow to your giftee.";

  const label = document.createElement("label");
  label.className = "ds-body-xs-regular ds-color-text-default";
  label.style.cssText =
    "display:flex;align-items:flex-start;gap:var(--ds-spacing-2xs, 0.375rem);cursor:pointer;";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.style.marginTop = "0.15rem";
  if (readIntent() === "cart-yes") input.checked = true;

  const span = document.createElement("span");
  const lead = document.createElement("strong");
  lead.textContent = "Yes — I want Wrrapd gift wrap";
  span.append(lead, document.createTextNode(" (and hear about flowers & final delivery)."));

  input.addEventListener("change", () => {
    if (input.checked) {
      writeIntent("cart-yes");
      openLegoGiftWrapIntroModal();
    } else {
      writeIntent("");
    }
  });

  label.append(input, span);
  wrap.append(hook, sub, label);
  btn.parentElement.insertBefore(wrap, btn);
}

function mountCheckoutStepZero() {
  if (existingCheckoutStep0()) return;
  if (readIntent() === "cart-yes" || readIntent() === "dismissed-step0") return;

  const headline = findShippingStepHeadline();
  if (!headline?.parentElement) return;

  const section = document.createElement("section");
  section.setAttribute(LEGO_GIFT_CHECKOUT_STEP0_DATA_ATTR, "1");
  section.setAttribute("role", "region");
  section.setAttribute("aria-label", "Gift wrap with Wrrapd");
  section.style.cssText = [
    "box-sizing:border-box",
    "width:100%",
    "margin:0 0 var(--ds-spacing-md, 1rem) 0",
    "padding:var(--ds-spacing-sm, 0.75rem)",
    "background-color:var(--ds-color-layer-neutral-default, #fff)",
    "border-radius:var(--ds-border-radius-md, 0.5rem)",
    "box-shadow:var(--ds-shadow-deep-sm, 0 1px 3px rgba(0,0,0,.08))",
    "border-left:4px solid var(--ds-color-border-accent-default, #ff8e14)",
  ].join(";");

  const title = document.createElement("h2");
  title.className = "ds-heading-sm ds-color-text-default";
  title.style.margin = "0 0 var(--ds-spacing-2xs, 0.375rem) 0";
  title.textContent =
    "0. How about gift-wrapping it with Wrrapd — or delivering it with flowers?";

  const blurb = document.createElement("p");
  blurb.className = "ds-body-xs-regular ds-color-text-subdued";
  blurb.style.margin = "0 0 var(--ds-spacing-sm, 0.75rem) 0";
  blurb.textContent =
    "You skipped the option on My Bag — no worries. One tap opens how Wrrapd finishes the gift after LEGO ships to our hub.";

  const row = document.createElement("div");
  row.style.cssText =
    "display:flex;flex-wrap:wrap;gap:var(--ds-spacing-2xs, 0.375rem);align-items:center;";

  const yes = document.createElement("button");
  yes.type = "button";
  yes.className =
    "sk-button sk-button--primary sk-button--small sk-button--neutral";
  yes.textContent = "Yes — show me";

  const later = document.createElement("button");
  later.type = "button";
  later.className =
    "sk-button sk-button--secondary sk-button--small sk-button--neutral";
  later.textContent = "Not now";

  yes.addEventListener("click", () => {
    writeIntent("cart-yes");
    openLegoGiftWrapIntroModal();
    section.remove();
  });
  later.addEventListener("click", () => {
    writeIntent("dismissed-step0");
    section.remove();
  });

  row.append(yes, later);
  section.append(title, blurb, row);
  headline.parentElement.insertBefore(section, headline);
}

function tryMountGiftUpsell() {
  const path = (window.location.pathname || "").toLowerCase();
  const isCart = path.includes("/cart");
  const isCheckout =
    path.includes("/checkout") || path.includes("/checkouts");

  if (isCart) {
    mountCartGiftOptIn();
    return;
  }

  if (isCheckout && !isLegoCheckoutReviewLikePage()) {
    mountCheckoutStepZero();
  }
}

/**
 * Bag: checkbox above Checkout Securely. Checkout shipping: step 0 if user did not opt in on bag.
 */
export function initLegoGiftWrapUpsell() {
  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      tryMountGiftUpsell();
    });
  };

  tryMountGiftUpsell();
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", schedule);
}
