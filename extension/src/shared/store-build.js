/** @type {boolean|undefined} Injected by esbuild `--define:WRRAPD_STORE_BUILD=true` for store builds. */
/* global WRRAPD_STORE_BUILD */

export const IS_STORE_BUILD =
  typeof WRRAPD_STORE_BUILD !== "undefined" && WRRAPD_STORE_BUILD === true;

/** Attach a DevTools-only global; stripped from Chrome Web Store bundles. */
export function exposeDebugGlobal(key, value) {
  if (IS_STORE_BUILD || typeof window === "undefined") return;
  window[key] = value;
}

/** Attach a build tag global; stripped from Chrome Web Store bundles. */
export function exposeBuildTag(key, tag) {
  if (IS_STORE_BUILD || typeof window === "undefined") return;
  window[key] = tag;
}
