import {
  LEGO_HUB_SHIP_HINT_DATA_ATTR,
  WRRAPD_HUB_ADDRESS_OBJECT,
  WRRAPD_HUB_SHIP_LINES,
} from "./constants.js";
import { isLegoCheckoutReviewLikePage } from "./lego-checkout-review-detect.js";

const HUB_ADDRESS_TEXT = WRRAPD_HUB_SHIP_LINES.join("\n");

const HUB_LOCK_ATTR = "data-wrrapd-lego-hub-address-locked";

function existingHint() {
  return document.querySelector(`[${LEGO_HUB_SHIP_HINT_DATA_ATTR}]`);
}

function findCartOrderSummaryMount() {
  const desktopCta = document.querySelector(
    '[data-test="checkout-securely-button-desktop"]',
  );
  if (desktopCta) {
    const aside = desktopCta.closest("aside");
    if (aside) {
      const wrap = aside.querySelector('[class*="orderSummary_summaryWrapper"]');
      if (wrap) return wrap;
      return aside;
    }
  }
  const asides = document.querySelectorAll("aside");
  for (const aside of asides) {
    if (
      aside.className &&
      String(aside.className).includes("cart_cartSideBar")
    ) {
      const wrap = aside.querySelector('[class*="orderSummary_summaryWrapper"]');
      if (wrap) return wrap;
      return aside;
    }
  }
  return null;
}

function findCheckoutMount() {
  return (
    document.getElementById("main-content") ||
    document.querySelector("main[role='main']") ||
    document.querySelector("main")
  );
}

/**
 * React-controlled inputs: assign via the native prototype so framework state updates.
 */
function setNativeInputValue(input, value) {
  if (!input || (input.tagName !== "INPUT" && input.tagName !== "TEXTAREA")) {
    return;
  }
  const proto = Object.getPrototypeOf(input);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc?.set) {
    desc.set.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function queryFirst(root, selectors) {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function findManualAddressTrigger(root) {
  const candidates = root.querySelectorAll("button, a, [role='button']");
  for (const el of candidates) {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (
      /enter\s+it\s+manually|enter\s+address\s+manually|type\s+your\s+address|add\s+address\s+manually/i.test(
        t,
      )
    ) {
      return el;
    }
  }
  return null;
}

function hideLegoAddressFinder(root) {
  const finderInput = root.querySelector(
    '[data-test="address-finder-input"], input[id*="address-finder" i], input[name*="address-finder" i], input[aria-label*="address finder" i]',
  );
  const nodes = new Set();
  if (finderInput) {
    let p = finderInput.parentElement;
    for (let i = 0; i < 8 && p; i += 1, p = p.parentElement) {
      nodes.add(p);
    }
  }
  for (const el of root.querySelectorAll("[class*='addressFinder'], [class*='AddressFinder']")) {
    nodes.add(el);
  }
  for (const el of nodes) {
    if (!el?.style) continue;
    el.setAttribute(HUB_LOCK_ATTR, "hidden");
    el.style.setProperty("display", "none", "important");
  }
  for (const el of root.querySelectorAll("button, a, [role='button']")) {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (/can'?t see your address|enter it manually/i.test(t)) {
      el.setAttribute(HUB_LOCK_ATTR, "hidden");
      el.style.setProperty("display", "none", "important");
    }
  }
}

function lockField(el) {
  if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return;
  el.setAttribute(HUB_LOCK_ATTR, "1");
  el.readOnly = true;
  el.setAttribute("readonly", "readonly");
  el.setAttribute("aria-readonly", "true");
}

function fillHubAddressFields(root) {
  const hub = WRRAPD_HUB_ADDRESS_OBJECT;
  const line1Selectors = [
    '[name="addressLine1"]',
    '[name="line1"]',
    '[name="shipAddress1"]',
    '[name="address1"]',
    'input[autocomplete="address-line1"]',
  ];
  const citySelectors = [
    '[name="city"]',
    '[name="town"]',
    '[name="shipCity"]',
    'input[autocomplete="address-level2"]',
  ];
  const stateSelectors = [
    '[name="state"]',
    '[name="stateCode"]',
    '[name="region"]',
    '[name="shipState"]',
    'select[name="state"]',
    'select[name="stateCode"]',
    'input[autocomplete="address-level1"]',
  ];
  const postalSelectors = [
    '[name="postalCode"]',
    '[name="zipCode"]',
    '[name="postcode"]',
    '[name="shipPostalCode"]',
    'input[autocomplete="postal-code"]',
  ];
  const orgSelectors = [
    '[name="organization"]',
    '[name="company"]',
    '[name="companyName"]',
    '[name="addressLine0"]',
  ];

  const first = root.querySelector('[name="firstName"], input[autocomplete="given-name"]');
  const last = root.querySelector('[name="lastName"], input[autocomplete="family-name"]');
  const line1 = queryFirst(root, line1Selectors);
  const city = queryFirst(root, citySelectors);
  const state = queryFirst(root, stateSelectors);
  const postal = queryFirst(root, postalSelectors);
  const org = queryFirst(root, orgSelectors);

  if (first) {
    setNativeInputValue(first, hub.recipientFirstName);
    lockField(first);
  }
  if (last) {
    setNativeInputValue(last, hub.recipientLastName);
    lockField(last);
  }
  if (org) {
    setNativeInputValue(org, hub.organization);
    lockField(org);
  }
  if (line1) {
    setNativeInputValue(line1, hub.addressLine1);
    lockField(line1);
  }
  if (city) {
    setNativeInputValue(city, hub.city);
    lockField(city);
  }
  if (state) {
    if (state.tagName === "SELECT") {
      const opt = [...state.options].find(
        (o) => o.value === hub.state || (o.textContent || "").includes(hub.state),
      );
      if (opt) {
        state.value = opt.value;
        state.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else {
      setNativeInputValue(state, hub.state);
    }
    lockField(state);
  }
  if (postal) {
    setNativeInputValue(postal, hub.postalCode);
    lockField(postal);
  }

  const finder = root.querySelector(
    '[data-test="address-finder-input"], input[id*="address-finder" i], input[name*="address-finder" i]',
  );
  if (finder) {
    const combined = [hub.addressLine1, hub.city, hub.state, hub.postalCode].join(", ");
    setNativeInputValue(finder, combined);
    lockField(finder);
  }

  const complete = Boolean(line1 && city && state && postal);
  return { complete, line1, city, state, postal };
}

/**
 * Prefer manual entry so line/city/state/ZIP inputs mount, then fill and hide finder UI.
 */
export function populateAndLockLegoHubAddress() {
  const root =
    document.getElementById("main-content") ||
    document.querySelector("main[role='main']") ||
    document.body;

  const manual = findManualAddressTrigger(root);
  if (manual) {
    manual.click();
  }

  const tryOnce = () => {
    const result = fillHubAddressFields(root);
    if (result.complete) {
      hideLegoAddressFinder(root);
    }
    return result.complete;
  };

  if (tryOnce()) return;

  let obs;
  const done = () => {
    if (obs) obs.disconnect();
    window.clearTimeout(timer);
  };

  obs = new MutationObserver(() => {
    if (tryOnce()) done();
  });
  obs.observe(root, { childList: true, subtree: true });

  const timer = window.setTimeout(() => {
    obs.disconnect();
    fillHubAddressFields(root);
    hideLegoAddressFinder(root);
  }, 6000);
}

function buildHubCard(options) {
  const { showApplyButton } = options || {};
  const section = document.createElement("section");
  section.setAttribute(LEGO_HUB_SHIP_HINT_DATA_ATTR, "1");
  section.setAttribute("role", "region");
  section.setAttribute("aria-label", "Wrrapd shipping address");
  section.style.cssText = [
    "box-sizing:border-box",
    "width:100%",
    "margin:0 0 var(--ds-spacing-sm, 0.75rem) 0",
    "padding:var(--ds-spacing-sm, 0.75rem)",
    "background-color:var(--ds-color-layer-neutral-default, #fff)",
    "border-radius:var(--ds-border-radius-md, 0.5rem)",
    "box-shadow:var(--ds-shadow-deep-sm, 0 1px 3px rgba(0,0,0,.08))",
  ].join(";");

  const title = document.createElement("h2");
  title.className = "ds-heading-sm ds-color-text-default";
  title.style.margin = "0 0 var(--ds-spacing-xs, 0.5rem) 0";
  title.textContent = "Ship to Wrrapd hub";

  const blurb = document.createElement("p");
  blurb.className = "ds-body-xs-regular ds-color-text-subdued";
  blurb.style.margin = "0 0 var(--ds-spacing-2xs, 0.375rem) 0";
  blurb.textContent =
    "For guest checkout, use this shipping address when LEGO.com asks where to send your order.";

  const addr = document.createElement("address");
  addr.className = "ds-label-sm-medium ds-color-text-default";
  addr.style.cssText =
    "margin:0 0 var(--ds-spacing-sm, 0.75rem) 0;font-style:normal;white-space:pre-line;";
  addr.textContent = HUB_ADDRESS_TEXT;

  const btnRow = document.createElement("div");
  btnRow.style.cssText =
    "display:flex;flex-wrap:wrap;gap:var(--ds-spacing-2xs, 0.375rem);align-items:center;";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.setAttribute("data-skroll", "Button");
  copyBtn.className =
    "sk-button sk-button--secondary sk-button--small sk-button--neutral";
  copyBtn.textContent = "Copy address";

  const status = document.createElement("p");
  status.className = "ds-body-xs-regular ds-color-text-subdued";
  status.style.margin = "var(--ds-spacing-2xs, 0.375rem) 0 0 0";
  status.setAttribute("aria-live", "polite");
  status.hidden = true;
  status.textContent = "";

  copyBtn.addEventListener("click", async () => {
    status.hidden = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(HUB_ADDRESS_TEXT);
      } else {
        const ta = document.createElement("textarea");
        ta.value = HUB_ADDRESS_TEXT;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      status.textContent = "Copied to clipboard.";
    } catch {
      status.textContent = "Copy failed — select the address above and copy manually.";
    }
    window.setTimeout(() => {
      status.textContent = "";
      status.hidden = true;
    }, 3500);
  });

  btnRow.appendChild(copyBtn);

  if (showApplyButton) {
    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.setAttribute("data-skroll", "Button");
    applyBtn.className =
      "sk-button sk-button--primary sk-button--small sk-button--neutral";
    applyBtn.textContent = "Use Wrrapd hub address";
    applyBtn.addEventListener("click", () => {
      populateAndLockLegoHubAddress();
      status.hidden = false;
      status.textContent =
        "Address fields updated. Confirm details on the page before continuing.";
      window.setTimeout(() => {
        status.textContent = "";
        status.hidden = true;
      }, 5000);
    });
    btnRow.appendChild(applyBtn);
  }

  section.append(title, blurb, addr, btnRow, status);
  return section;
}

function mountIntoCartSummary(wrapper) {
  if (existingHint()) return;
  const card = buildHubCard({ showApplyButton: false });
  const heading = wrapper.querySelector("h2.ds-heading-md, h2[class*='orderSummary_summaryHeading']");
  if (heading?.nextSibling) {
    wrapper.insertBefore(card, heading.nextSibling);
  } else {
    wrapper.insertBefore(card, wrapper.firstChild);
  }
}

function mountCheckoutMain(main) {
  if (existingHint()) return;
  const card = buildHubCard({ showApplyButton: true });
  if (main.firstElementChild) {
    main.insertBefore(card, main.firstElementChild);
  } else {
    main.appendChild(card);
  }
}

function tryMountHubHint() {
  const path = (window.location.pathname || "").toLowerCase();
  const isCart = path.includes("/cart");
  const isCheckout =
    path.includes("/checkout") || path.includes("/checkouts");

  const hint = existingHint();
  if (hint) {
    if (isCheckout && isLegoCheckoutReviewLikePage()) {
      hint.remove();
    }
    return;
  }

  if (isCart) {
    const target = findCartOrderSummaryMount();
    if (target) mountIntoCartSummary(target);
    return;
  }

  if (isCheckout) {
    if (isLegoCheckoutReviewLikePage()) return;
    const main = findCheckoutMount();
    if (main) mountCheckoutMain(main);
  }
}

/**
 * Injects a LEGO-styled “ship to hub” card on bag/cart and checkout paths.
 * Safe to call multiple times; uses MutationObserver until the mount point exists.
 */
export function initLegoHubShipAddressHint() {
  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      tryMountHubHint();
    });
  };

  tryMountHubHint();

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", schedule);
}
