/**
 * Forward verified Shopify payloads to api.wrrapd.com.
 * Developer: Wrrapd Inc.
 */

const DEFAULT_API = "https://api.wrrapd.com";

function apiBase() {
  return String(process.env.WRRAPD_API_BASE || DEFAULT_API).replace(/\/$/, "");
}

function secret() {
  return String(process.env.SHOPIFY_WRRAPD_WEBHOOK_SECRET || "").trim();
}

async function postWrrapd(path, body) {
  const s = secret();
  if (!s) {
    return { ok: false, status: 500, body: { error: "SHOPIFY_WRRAPD_WEBHOOK_SECRET missing" } };
  }
  const response = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Wrrapd-Shopify-Secret": s,
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

/**
 * @param {object} body — { shop, topic?, order }
 */
export async function forwardOrderToWrrapd(body) {
  return postWrrapd("/api/shopify/orders", body);
}

/**
 * @param {object} body — { shop, topic, payload }
 */
export async function forwardPrivacyToWrrapd(body) {
  return postWrrapd("/api/shopify/privacy", body);
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
