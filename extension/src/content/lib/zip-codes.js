/**
 * Allowed delivery zip codes from Wrrapd API.
 */

let allowedZipCodes = [];
let zipCodesLoaded = false;

export function normalizePostal5(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 5);
}

export async function loadAllowedZipCodes({ force = false } = {}) {
  if (zipCodesLoaded && !force) return allowedZipCodes;

  try {
    const response = await fetch("https://api.wrrapd.com/api/allowed-zip-codes", {
      cache: "no-store",
    });
    if (response.ok) {
      const data = await response.json();
      allowedZipCodes = Array.isArray(data.allowedZipCodes) ? data.allowedZipCodes : [];
      zipCodesLoaded = true;
    } else {
      console.error("[Content] Failed to load zip codes from API. Response status:", response.status);
      allowedZipCodes = [];
      zipCodesLoaded = true;
    }
  } catch (error) {
    console.error("[Content] Error loading zip codes:", error);
    allowedZipCodes = [];
    zipCodesLoaded = true;
  }

  return allowedZipCodes;
}

export async function isPostalCodeAllowed(postalCode) {
  const zip = normalizePostal5(postalCode);
  if (zip.length !== 5) return false;
  if (!zipCodesLoaded) await loadAllowedZipCodes();
  return allowedZipCodes.includes(zip);
}

export async function isZipCodeAllowed(subItem) {
  const zipCode = subItem?.shippingAddress?.postalCode;
  if (!zipCode) return false;
  return isPostalCodeAllowed(zipCode);
}

void loadAllowedZipCodes();
