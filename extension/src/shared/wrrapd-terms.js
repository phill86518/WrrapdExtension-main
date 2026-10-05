/**
 * Shopper terms are served by api.wrrapd.com. This file only loads them.
 */

const TERMS_URL = "https://api.wrrapd.com/api/shopper-terms";

export async function loadWrrapdTermsHtml(retailerLabel) {
  const retailer = String(retailerLabel || "the retailer").trim() || "the retailer";
  const response = await fetch(`${TERMS_URL}?retailer=${encodeURIComponent(retailer)}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.html !== "string" || !body.html.trim()) {
    throw new Error("terms");
  }
  return body.html;
}
