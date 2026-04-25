import { LEGO_FINAL_DELIVERY_MSG_DATA_ATTR } from "./constants.js";
import { isLegoCheckoutReviewLikePage } from "./lego-checkout-review-detect.js";

function existingMessage() {
  return document.querySelector(`[${LEGO_FINAL_DELIVERY_MSG_DATA_ATTR}]`);
}

function findCheckoutOrderSummaryMount() {
  const asides = document.querySelectorAll("aside");
  for (const aside of asides) {
    const cls = String(aside.className || "");
    if (cls.includes("orderSummary") || aside.querySelector('[class*="orderSummary"]')) {
      const wrap = aside.querySelector('[class*="orderSummary_summaryWrapper"]');
      return wrap || aside;
    }
  }
  const byTest = document.querySelector(
    '[data-test*="order-summary" i], [data-test*="orderSummary" i]',
  );
  if (byTest) {
    const aside = byTest.closest("aside");
    if (aside) {
      const wrap = aside.querySelector('[class*="orderSummary_summaryWrapper"]');
      return wrap || aside;
    }
    return byTest;
  }
  return null;
}

function findCheckoutMain() {
  return (
    document.getElementById("main-content") ||
    document.querySelector("main[role='main']") ||
    document.querySelector("main")
  );
}

function buildFinalDeliveryCard() {
  const section = document.createElement("section");
  section.setAttribute(LEGO_FINAL_DELIVERY_MSG_DATA_ATTR, "1");
  section.setAttribute("role", "region");
  section.setAttribute("aria-label", "Wrrapd gift delivery");
  section.style.cssText = [
    "box-sizing:border-box",
    "width:100%",
    "margin:0 0 var(--ds-spacing-sm, 0.75rem) 0",
    "padding:var(--ds-spacing-sm, 0.75rem)",
    "background-color:var(--ds-color-layer-neutral-default, #fff)",
    "border-radius:var(--ds-border-radius-md, 0.5rem)",
    "box-shadow:var(--ds-shadow-deep-sm, 0 1px 3px rgba(0,0,0,.08))",
    "border-left:4px solid var(--ds-color-border-accent-default, #ff8e14)",
  ].join(";");

  const title = document.createElement("h2");
  title.className = "ds-heading-xs ds-color-text-default";
  title.style.margin = "0 0 var(--ds-spacing-2xs, 0.375rem) 0";
  title.textContent = "Where this LEGO order is going";

  const p1 = document.createElement("p");
  p1.className = "ds-body-xs-regular ds-color-text-default";
  p1.style.margin = "0 0 var(--ds-spacing-2xs, 0.375rem) 0";
  p1.textContent =
    "LEGO.com ships this purchase to the Wrrapd gift hub first. The shipping address on this page is the hub — that is where we receive your items for wrapping.";

  const p2 = document.createElement("p");
  p2.className = "ds-body-xs-regular ds-color-text-subdued";
  p2.style.margin = "0";
  p2.textContent =
    "Final delivery to your giftee is arranged by Wrrapd after gift wrap; it is not shown as a second LEGO.com shipment at checkout.";

  section.append(title, p1, p2);
  return section;
}

function mountIntoSummary(wrapper) {
  if (existingMessage()) return;
  const card = buildFinalDeliveryCard();
  const heading = wrapper.querySelector(
    "h2.ds-heading-md, h2[class*='orderSummary_summaryHeading'], h2.ds-heading-sm",
  );
  if (heading?.nextSibling) {
    wrapper.insertBefore(card, heading.nextSibling);
  } else {
    wrapper.insertBefore(card, wrapper.firstChild);
  }
}

function mountIntoMain(main) {
  if (existingMessage()) return;
  const card = buildFinalDeliveryCard();
  if (main.firstElementChild) {
    main.insertBefore(card, main.firstElementChild);
  } else {
    main.appendChild(card);
  }
}

function tryMountFinalDeliveryMessage() {
  if (existingMessage()) return;
  const path = (window.location.pathname || "").toLowerCase();
  const isCheckout =
    path.includes("/checkout") || path.includes("/checkouts");
  if (!isCheckout || !isLegoCheckoutReviewLikePage()) return;

  const summary = findCheckoutOrderSummaryMount();
  if (summary) {
    mountIntoSummary(summary);
    return;
  }
  const main = findCheckoutMain();
  if (main) mountIntoMain(main);
}

/**
 * On LEGO checkout review / final-total steps, explains hub receipt vs giftee delivery.
 */
export function initLegoCheckoutFinalDeliveryMessage() {
  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      tryMountFinalDeliveryMessage();
    });
  };

  tryMountFinalDeliveryMessage();

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", schedule);
}
