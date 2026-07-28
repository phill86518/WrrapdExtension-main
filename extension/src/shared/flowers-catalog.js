/**
 * Live proximity flower catalog (api.wrrapd.com).
 * Prefetch on ZIP submit warms both server + client cache so Add Flowers is instant.
 */

const API = "https://api.wrrapd.com";

/** @type {Map<string, { status: string, choices: any[], message?: string, source?: string|null, disclaimer?: string|null, at: number }>} */
const cache = new Map();
const inflight = new Map();

function zip5(postalCode) {
  return String(postalCode || "").replace(/\D/g, "").slice(0, 5);
}

async function fetchCatalogPayload(zip) {
  const r = await fetch(`${API}/api/flowers/catalog?postalCode=${encodeURIComponent(zip)}`);
  const body = await r.json().catch(() => ({}));
  return {
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
}

/**
 * Warm server + client cache as soon as ZIP is confirmed.
 * Prefer a full catalog GET so choices are ready before Add Flowers is checked.
 */
export function prefetchFlowersCatalog(postalCode) {
  const zip = zip5(postalCode);
  if (zip.length !== 5) return Promise.resolve();
  if (cache.has(zip) && Date.now() - cache.get(zip).at < 30 * 60 * 1000) {
    return Promise.resolve();
  }
  if (inflight.has(zip)) return inflight.get(zip);
  const p = (async () => {
    try {
      // Fire-and-forget server warm (idempotent with the GET below).
      void fetch(`${API}/api/flowers/prefetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postalCode: zip }),
      }).catch(() => undefined);
      const payload = await fetchCatalogPayload(zip);
      cache.set(zip, payload);
    } catch {
      /* ignore — loadFlowersCatalog will retry */
    } finally {
      inflight.delete(zip);
    }
  })();
  inflight.set(zip, p);
  return p;
}

export async function loadFlowersCatalog(postalCode) {
  const zip = zip5(postalCode);
  if (zip.length !== 5) {
    return {
      status: "unavailable",
      choices: [],
      message: "Please enter a valid ZIP first.",
    };
  }
  const hit = cache.get(zip);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit;
  if (inflight.has(zip)) {
    await inflight.get(zip);
    const after = cache.get(zip);
    if (after) return after;
  }
  try {
    const payload = await fetchCatalogPayload(zip);
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
