/**
 * Entry for the bundled content script. The legacy script is still one IIFE;
 * we import it for side effects until the code is split into real modules.
 *
 * Production (`npm run build`): `__WRRAPD_SHIP__=true`, esbuild `--drop:console` — no console noise in DevTools.
 * Dev (`npm run build:dev`): trace HUD via `localStorage.setItem('wrrapd-trace','1')`, `wrrapdDumpTrace()`, etc.
 */
import { initWrrapdCheckoutDebug } from './lib/wrrapd-debug.js';
import './content-legacy.js';
import './lib/amazon-delivery-hints.js';

/** Bump when verifying deploy — in DevTools: `window.__WRRAPD_CONTENT_BUILD_TAG__`. */
export const WRRAPD_CONTENT_BUILD_TAG = '2026-04-21-hints-debounce-no-spam-storage';
if (typeof window !== 'undefined') {
    window.__WRRAPD_CONTENT_BUILD_TAG__ = WRRAPD_CONTENT_BUILD_TAG;
    initWrrapdCheckoutDebug({ tag: WRRAPD_CONTENT_BUILD_TAG });
}
