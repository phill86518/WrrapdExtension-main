import { TARGET_WRRAPD_SLOT_ID } from "./constants.js";

/**
 * Persistent full-width slot at the top of Target cart/checkout — not the narrow
 * order-summary sidebar where Wrrapd gets squished beside "Check out".
 *
 * @returns {HTMLElement | null}
 */
export function ensureTargetWrrapdMountSlot() {
  let slot = document.getElementById(TARGET_WRRAPD_SLOT_ID);
  if (slot && !slot.isConnected) slot = null;

  const main =
    document.querySelector("main") ||
    document.querySelector("[role='main']") ||
    document.querySelector('[data-test="cartItem"]')?.closest("main") ||
    document.body;

  if (!slot) {
    slot = document.createElement("div");
    slot.id = TARGET_WRRAPD_SLOT_ID;
    slot.setAttribute("data-wrrapd-target-slot", "1");
    slot.style.cssText = [
      "box-sizing:border-box",
      "width:100%",
      "max-width:100%",
      "margin:0 0 16px",
      "padding:0",
      "grid-column:1 / -1",
    ].join(";");
  }

  if (slot.parentElement !== main || slot !== main.firstElementChild) {
    main.insertBefore(slot, main.firstElementChild);
  }

  return slot;
}

/** @returns {{ parent: Element, before?: Element|null } | null} */
export function findTargetWrrapdMountAnchor() {
  const slot = ensureTargetWrrapdMountSlot();
  if (!slot) return null;
  return { parent: slot, before: null };
}
