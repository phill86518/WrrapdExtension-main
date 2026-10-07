/**
 * Allowed delivery zip codes from Wrrapd API.
 */

let allowedZipCodes = [];
let zipCodesLoaded = false;
let loadPromise = null;

export function normalizePostal5(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 5);
}

/** True after a successful allowlist fetch. A failed fetch does not count. */
export function allowedZipListReady() {
  return zipCodesLoaded;
}

export async function loadAllowedZipCodes({ force = false } = {}) {
  if (zipCodesLoaded && !force) return allowedZipCodes;
  if (loadPromise && !force) return loadPromise;

  const run = (async () => {
    const response = await fetch("https://api.wrrapd.com/api/allowed-zip-codes", {
      cache: "no-store",
    });
    if (!response.ok) {
      const err = new Error(`zip-list ${response.status}`);
      err.status = response.status;
      throw err;
    }
    const data = await response.json();
    if (!Array.isArray(data.allowedZipCodes)) throw new Error("zip-list");
    allowedZipCodes = data.allowedZipCodes
      .map((z) => normalizePostal5(z))
      .filter((z) => z.length === 5);
    zipCodesLoaded = true;
    return allowedZipCodes;
  })();

  loadPromise = run;
  try {
    return await run;
  } catch (error) {
    console.error("[Content] Error loading zip codes:", error);
    throw error;
  } finally {
    if (loadPromise === run) loadPromise = null;
  }
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

void loadAllowedZipCodes().catch(() => {});
