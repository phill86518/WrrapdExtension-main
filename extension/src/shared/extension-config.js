/**
 * Hub address, occasion list, and order-number codes live on api.wrrapd.com.
 * The last good copy is kept in chrome.storage.local (extension-only, never the retailer page).
 *
 * `hub` is the default delivery hub until the shopper submits a giftee ZIP; then the
 * server's closest hub for that ZIP replaces it (per retailer site, kept across page loads).
 */

const CONFIG_URL = "https://api.wrrapd.com/api/extension-config";
const HUB_URL = "https://api.wrrapd.com/api/delivery-hub";
const STORE_KEY = "wrrapdExtensionConfigV1";
const HUB_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

let cached = null;
let loading = null;
let assigned = null;
let assigning = null;
let merged = null;

function validHub(hub) {
  return Boolean(hub && hub.addressLine1 && hub.city && hub.state && hub.postalCode);
}

function validConfig(body) {
  return Boolean(body && validHub(body.hub) && Array.isArray(body.occasions));
}

function hubStoreKey() {
  let host = "";
  try {
    host = String(location.hostname || "").replace(/^www\./, "");
  } catch {
    /* ignore */
  }
  return `wrrapdDeliveryHubV1:${host || "default"}`;
}

function storageGet(key) {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === "undefined" || !chrome.storage?.local) return resolve(null);
      chrome.storage.local.get(key, (out) => resolve((out && out[key]) || null));
    } catch {
      resolve(null);
    }
  });
}

function storageSet(key, value) {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    if (value == null) chrome.storage.local.remove?.(key);
    else chrome.storage.local.set({ [key]: value });
  } catch {
    /* ignore */
  }
}

async function readStoredConfig() {
  const body = await storageGet(STORE_KEY);
  return validConfig(body) ? body : null;
}

async function readStoredHub() {
  const row = await storageGet(hubStoreKey());
  if (!row || !validHub(row.hub) || !/^\d{5}$/.test(String(row.postalCode || ""))) return null;
  if (!(Date.now() - Number(row.at) < HUB_MAX_AGE_MS)) return null;
  return row;
}

function timeoutSignal(ms) {
  return typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(ms) : undefined;
}

async function fetchConfig() {
  const response = await fetch(CONFIG_URL, { cache: "no-store", credentials: "omit", signal: timeoutSignal(8000) });
  if (!response.ok) throw new Error("config");
  const body = await response.json();
  if (!validConfig(body)) throw new Error("config");
  return body;
}

async function fetchHubForZip(zip) {
  const url = `${HUB_URL}?postalCode=${encodeURIComponent(zip)}`;
  const response = await fetch(url, { cache: "no-store", credentials: "omit", signal: timeoutSignal(5000) });
  if (!response.ok) throw new Error("hub");
  const body = await response.json();
  if (!validHub(body?.hub)) throw new Error("hub");
  return body.hub;
}

export function extensionConfig() {
  if (!cached) return null;
  if (!assigned) return cached;
  if (!merged || merged.base !== cached || merged.assigned !== assigned) {
    merged = { base: cached, assigned, value: { ...cached, hub: assigned.hub } };
  }
  return merged.value;
}

function maybeAssignHubFromSessionZip() {
  const zip = peekValidatedGifteeZip();
  if (zip && (!assigned || assigned.postalCode !== zip)) {
    assignDeliveryHubForZip(zip).catch(() => undefined);
  }
}

function loadConfig() {
  if (cached) return Promise.resolve(cached);
  if (!loading) {
    loading = (async () => {
      const [stored, storedHub] = await Promise.all([readStoredConfig(), readStoredHub()]);
      if (storedHub && !assigned) assigned = storedHub;
      maybeAssignHubFromSessionZip();
      if (stored) {
        cached = stored;
        fetchConfig()
          .then((fresh) => {
            cached = fresh;
            storageSet(STORE_KEY, fresh);
          })
          .catch(() => undefined);
        return cached;
      }
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          cached = await fetchConfig();
          storageSet(STORE_KEY, cached);
          return cached;
        } catch (error) {
          lastError = error;
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
      throw lastError || new Error("config");
    })().catch((error) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}

/** Last giftee ZIP the shopper submitted in this tab (any retailer prefix). */
function peekValidatedGifteeZip() {
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key || !key.endsWith("ValidatedEstimateZip")) continue;
      const zip = String(sessionStorage.getItem(key) || "").replace(/\D/g, "").slice(0, 5);
      if (zip.length === 5) return zip;
    }
  } catch {
    /* ignore */
  }
  return "";
}

/** Config with the giftee's delivery hub applied (waits for a hub lookup still in flight). */
export async function ensureExtensionConfig() {
  await loadConfig();
  const zip = peekValidatedGifteeZip();
  if (zip && (!assigned || assigned.postalCode !== zip)) {
    await assignDeliveryHubForZip(zip);
  } else if (assigning) {
    await assigning;
  }
  return extensionConfig();
}

/**
 * Ask the server for the hub closest to this giftee ZIP. Runs in the background while the
 * shopper finishes the gift modal; ensureExtensionConfig() waits for it before any hub fill.
 * Resolves to the hub, or null (the default hub stays in use).
 */
export function assignDeliveryHubForZip(postalCode) {
  const zip = String(postalCode || "").replace(/\D/g, "").slice(0, 5);
  if (zip.length !== 5) return Promise.resolve(null);
  const run = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const hub = await fetchHubForZip(zip);
        assigned = { postalCode: zip, hub, at: Date.now() };
        storageSet(hubStoreKey(), assigned);
        return hub;
      } catch {
        if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
      }
    }
    if (assigned && assigned.postalCode !== zip) {
      assigned = null;
      storageSet(hubStoreKey(), null);
    }
    return null;
  })();
  assigning = run;
  run.finally(() => {
    if (assigning === run) assigning = null;
  });
  return run;
}

/** ZIP the current delivery hub was picked for ("" when the default hub is in use). */
export function assignedHubPostalCode() {
  return assigned ? assigned.postalCode : "";
}

loadConfig().catch(() => undefined);
