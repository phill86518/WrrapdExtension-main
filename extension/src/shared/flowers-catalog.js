/**
 * Live proximity flower catalog (api.wrrapd.com).
 * Prefetch on ZIP submit; load choices when Add Flowers is checked.
 */

const API = "https://api.wrrapd.com";

/** @type {Map<string, { status: string, choices: any[], message?: string, at: number }>} */
const cache = new Map();
const inflight = new Map();

export function prefetchFlowersCatalog(postalCode) {
  const zip = String(postalCode || "").replace(/\D/g, "").slice(0, 5);
  if (zip.length !== 5) return Promise.resolve();
  if (inflight.has(zip)) return inflight.get(zip);
  const p = fetch(`${API}/api/flowers/prefetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postalCode: zip }),
  })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => inflight.delete(zip));
  inflight.set(zip, p);
  return p;
}

export async function loadFlowersCatalog(postalCode) {
  const zip = String(postalCode || "").replace(/\D/g, "").slice(0, 5);
  if (zip.length !== 5) {
    return {
      status: "unavailable",
      choices: [],
      message: "Please enter a valid ZIP first.",
    };
  }
  const hit = cache.get(zip);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit;
  try {
    const r = await fetch(`${API}/api/flowers/catalog?postalCode=${encodeURIComponent(zip)}`);
    const body = await r.json().catch(() => ({}));
    const payload = {
      status: body.status === "ok" ? "ok" : "unavailable",
      choices: Array.isArray(body.choices) ? body.choices : [],
      message:
        typeof body.message === "string"
          ? body.message
          : "We apologize — floral delivery is not currently available for this ZIP code.",
      source: typeof body.source === "string" ? body.source : null,
      disclaimer: typeof body.disclaimer === "string" ? body.disclaimer : null,
      at: Date.now(),
    };
    cache.set(zip, payload);
    return payload;
  } catch {
    return {
      status: "unavailable",
      choices: [],
      message:
        "We apologize — floral delivery is not currently available for this ZIP code. Gift wrapping is still available.",
      at: Date.now(),
    };
  }
}
