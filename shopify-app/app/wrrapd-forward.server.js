/**
 * Forward a verified Shopify order payload to api.wrrapd.com.
 * Developer: Wrrapd Inc.
 */

const DEFAULT_API = "https://api.wrrapd.com";

/**
 * @param {object} body — normalized Shopify order + shop domain
 * @returns {Promise<{ ok: boolean, status: number, body: object }>}
 */
export async function forwardOrderToWrrapd(body) {
  const base = String(process.env.WRRAPD_API_BASE || DEFAULT_API).replace(/\/$/, "");
  const secret = String(process.env.SHOPIFY_WRRAPD_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    return { ok: false, status: 500, body: { error: "SHOPIFY_WRRAPD_WEBHOOK_SECRET missing" } };
  }

  const response = await fetch(`${base}/api/shopify/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Wrrapd-Shopify-Secret": secret,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text.slice(0, 500) };
  }
  return { ok: response.ok, status: response.status, body: parsed };
}

/** Cart / note attributes that mark a Wrrapd wrap order. */
export function orderWantsWrrapd(order) {
  if (!order || typeof order !== "object") return false;
  const attrs = [
    ...(Array.isArray(order.note_attributes) ? order.note_attributes : []),
    ...(Array.isArray(order.noteAttributes) ? order.noteAttributes : []),
  ];
  for (const a of attrs) {
    const name = String(a?.name || a?.key || "").toLowerCase();
    const value = String(a?.value || "").toLowerCase();
    if (name.includes("wrrapd") && (value === "1" || value === "true" || value === "yes")) {
      return true;
    }
  }
  const note = String(order.note || "").toLowerCase();
  return note.includes("wrrapd wrap");
}
