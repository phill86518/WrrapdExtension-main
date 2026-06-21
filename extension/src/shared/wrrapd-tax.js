import { hubPostal5 } from "./wrrapd-hub.js";

/** Wrrapd hub ZIP (Duval County, FL) — default for sales-tax estimates on all retailers for now. */
export const WRRAPD_TAX_POSTAL_CODE = hubPostal5();

/**
 * Duval County FL combined rate for 32226 (7.5%) per server TAXRATES_ZIP5_FL CSV.
 * Used when pricing-preview has not returned yet or giftee ZIP is unknown.
 */
export const WRRAPD_DEFAULT_TAX_RATE_PERCENT = 7.5;

/** @param {number | null | undefined} fetchedPercent */
export function resolveTaxRatePercent(fetchedPercent) {
  if (typeof fetchedPercent === "number" && Number.isFinite(fetchedPercent)) {
    return fetchedPercent;
  }
  return WRRAPD_DEFAULT_TAX_RATE_PERCENT;
}

/** Postal code sent to pricing-preview / pricingCart for tax (hub ZIP until giftee ZIP is known). */
export function taxPostalForPricing(_gifteeZip) {
  return WRRAPD_TAX_POSTAL_CODE;
}
