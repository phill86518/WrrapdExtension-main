import { LEGO_GIFTEE_SHIP_CTX_DATA_ATTR } from "./constants.js";
import {
  readGiftChoicesSaved,
  readGiftLegalTermsAccepted,
  readGiftRadio,
} from "./lego-session-state.js";

function existing() {
  return document.querySelector(`[${LEGO_GIFTEE_SHIP_CTX_DATA_ATTR}]`);
}

function findMountTarget() {
  const main =
    document.getElementById("main-content") ||
    document.querySelector("main[role='main']") ||
    document.querySelector("main");
  return main || document.body;
}

/**
 * After Checkout Securely, LEGO often shows the giftee as the ship-to while the physical
 * first leg is still to the Wrrapd hub — clarify hub-first + timing.
 */
function tryMount() {
  const path = (window.location.pathname || "").toLowerCase();
  const isCheckout =
    (path.includes("/checkout") || path.includes("/checkouts")) && !path.includes("/cart");
  if (!isCheckout) return;
  if (readGiftRadio() !== "yes") return;
  if (!readGiftChoicesSaved() || !readGiftLegalTermsAccepted()) return;
  if (existing()) return;

  const host = document.createElement("aside");
  host.setAttribute(LEGO_GIFTEE_SHIP_CTX_DATA_ATTR, "1");
  host.setAttribute("role", "note");
  host.style.cssText = [
    "box-sizing:border-box",
    "width:100%",
    "max-width:52rem",
    "margin:0 auto var(--ds-spacing-sm, 0.75rem) auto",
    "padding:var(--ds-spacing-sm, 0.75rem)",
    "background:#eff6ff",
    "border:1px solid #93c5fd",
    "border-radius:var(--ds-border-radius-md, 0.5rem)",
    "color:#0f172a",
    "font-size:15px",
    "line-height:1.5",
  ].join(";");

  const title = document.createElement("strong");
  title.textContent = "How shipping looks on LEGO.com: ";
  const rest = document.createTextNode(
    "Step 1 may label the address as your giftee’s — that is usually LEGO’s way of showing who the order is ultimately for. The physical LEGO shipment for Wrrapd gift wrap still goes to the Wrrapd hub first (the hub address you confirmed), not straight to the giftee’s door. After we receive and wrap it, final delivery to the giftee is coordinated by Wrrapd and often takes about one extra business day after hub receipt.",
  );
  host.append(title, rest);

  const target = findMountTarget();
  if (target.firstElementChild) {
    target.insertBefore(host, target.firstElementChild);
  } else {
    target.appendChild(host);
  }
}

export function initLegoGifteeShippingContextNotice() {
  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      tryMount();
    });
  };

  tryMount();
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", schedule);
}
