/**
 * Hub address, occasion list, and order-number codes live on api.wrrapd.com.
 * The last good copy is kept in chrome.storage.local (extension-only, never the retailer page).
 */

const CONFIG_URL = "https://api.wrrapd.com/api/extension-config";
const STORE_KEY = "wrrapdExtensionConfigV1";

let cached = null;
let loading = null;

function validConfig(body) {
  return Boolean(body && body.hub && body.hub.addressLine1 && Array.isArray(body.occasions));
}

function readStoredConfig() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === "undefined" || !chrome.storage?.local) return resolve(null);
      chrome.storage.local.get(STORE_KEY, (out) => {
        const body = out && out[STORE_KEY];
        resolve(validConfig(body) ? body : null);
      });
    } catch {
      resolve(null);
    }
  });
}

function writeStoredConfig(body) {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    chrome.storage.local.set({ [STORE_KEY]: body });
  } catch {
    /* ignore */
  }
}

async function fetchConfig() {
  const signal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(8000) : undefined;
  const response = await fetch(CONFIG_URL, { cache: "no-store", credentials: "omit", signal });
  if (!response.ok) throw new Error("config");
  const body = await response.json();
  if (!validConfig(body)) throw new Error("config");
  return body;
}

export function extensionConfig() {
  return cached;
}

export function ensureExtensionConfig() {
  if (cached) return Promise.resolve(cached);
  if (!loading) {
    loading = (async () => {
      const stored = await readStoredConfig();
      if (stored) {
        cached = stored;
        fetchConfig()
          .then((fresh) => {
            cached = fresh;
            writeStoredConfig(fresh);
          })
          .catch(() => undefined);
        return cached;
      }
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          cached = await fetchConfig();
          writeStoredConfig(cached);
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

ensureExtensionConfig().catch(() => undefined);
