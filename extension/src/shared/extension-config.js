/**
 * Hub address, occasion list, and order-number codes live on api.wrrapd.com.
 */

const CONFIG_URL = "https://api.wrrapd.com/api/extension-config";

let cached = null;
let loading = null;

export function extensionConfig() {
  return cached;
}

export function ensureExtensionConfig() {
  if (cached) return Promise.resolve(cached);
  if (!loading) {
    loading = fetch(CONFIG_URL, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("config"))))
      .then((body) => {
        if (!body || !body.hub || !Array.isArray(body.occasions)) throw new Error("config");
        cached = body;
        return cached;
      })
      .catch((error) => {
        loading = null;
        throw error;
      });
  }
  return loading;
}

ensureExtensionConfig().catch(() => undefined);
