import { hubPostal5 } from "./wrrapd-hub.js";

/** Hub ZIP from /api/extension-config — used for tax estimates when no giftee ZIP is known. */
function hubTaxPostal() {
  return hubPostal5();
}

/** @param {number | null | undefined} fetchedPercent */
export function resolveTaxRatePercent(fetchedPercent) {
  if (typeof fetchedPercent === "number" && Number.isFinite(fetchedPercent)) {
    return fetchedPercent;
  }
  return null;
}

/** Postal code sent to pricing-preview / pricingCart for tax (giftee ZIP when known). */
export function taxPostalForPricing(gifteeZip) {
  const z = String(gifteeZip || "")
    .replace(/\D/g, "")
    .slice(0, 5);
  if (z.length === 5) return z;
  return hubTaxPostal();
}
