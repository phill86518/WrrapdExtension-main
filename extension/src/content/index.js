/**
 * Entry for the bundled content script. The legacy script is still one IIFE;
 * we import it for side effects until the code is split into real modules.
 *
 * Debug (Amazon checkout tab, then reload):
 * - `localStorage.setItem('wrrapd-trace','1')` — on-screen HUD + `window.__WRRAPD_TRACE__`
 * - `wrrapdDumpTrace()` — JSON of recent steps
 * - `wrrapdTraceEnableHud()` — HUD without localStorage
 * Production bundle no longer drops `console` so `[Wrrapd]` logs are visible if you add them.
 */
import { initWrrapdCheckoutDebug } from './lib/wrrapd-debug.js';
import './lib/amazon-account-signed-in.js';
import './lib/amazon-delivery-hints.js';
import './content-legacy.js';

/** Bump when verifying deploy — in DevTools: `window.__WRRAPD_CONTENT_BUILD_TAG__`. */
export const WRRAPD_CONTENT_BUILD_TAG = '2026-04-23-amazon-signed-in-pyo-only';
if (typeof window !== 'undefined') {
    window.__WRRAPD_CONTENT_BUILD_TAG__ = WRRAPD_CONTENT_BUILD_TAG;
    initWrrapdCheckoutDebug({ tag: WRRAPD_CONTENT_BUILD_TAG });
}
