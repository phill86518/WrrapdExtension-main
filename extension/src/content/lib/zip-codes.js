/**
 * Allowed delivery zip codes from Wrrapd API.
 */

let allowedZipCodes = [];
let zipCodesLoaded = false;

export async function loadAllowedZipCodes() {
  if (zipCodesLoaded) return allowedZipCodes;

  try {
    const response = await fetch('https://api.wrrapd.com/api/allowed-zip-codes');
    if (response.ok) {
      const data = await response.json();
      allowedZipCodes = data.allowedZipCodes || [];
      zipCodesLoaded = true;
    } else {
      console.error('[Content] Failed to load zip codes from API. Response status:', response.status);
      allowedZipCodes = [];
      zipCodesLoaded = true;
    }
  } catch (error) {
    console.error('[Content] Error loading zip codes:', error);
    allowedZipCodes = [];
    zipCodesLoaded = true;
  }

  return allowedZipCodes;
}

export async function isZipCodeAllowed(subItem) {
  console.log('[isZipCodeAllowed] Checking if zip code is allowed.');

  const zipCode = subItem?.shippingAddress?.postalCode;
  if (!zipCode) {
    console.log('[isZipCodeAllowed] No postalCode found, returning false.');
    return false;
  }

  if (!zipCodesLoaded) {
    await loadAllowedZipCodes();
  }
  const isAllowed = allowedZipCodes.includes(zipCode);
  console.log(`[isZipCodeAllowed] Zip code "${zipCode}" allowed: ${isAllowed}`);
  return isAllowed;
}

void loadAllowedZipCodes();
