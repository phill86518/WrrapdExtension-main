import { hubPostal5 } from "./wrrapd-hub.js";

/** Wrrapd hub ZIP (Duval County, FL) — default for sales-tax estimates on all retailers for now. */
export const WRRAPD_TAX_POSTAL_CODE = hubPostal5();

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
  return WRRAPD_TAX_POSTAL_CODE;
}
