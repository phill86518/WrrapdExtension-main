/**
 * Entry for the bundled content script. The legacy script is still one IIFE;
 * we import it for side effects until the code is split into real modules.
 */
import './content-legacy.js';
import './lib/amazon-delivery-hints.js';

/** Bump when verifying deploy — in DevTools: `window.__WRRAPD_CONTENT_BUILD_TAG__`. */
export const WRRAPD_CONTENT_BUILD_TAG = '2026-04-15-terms-signature-hotfix+loading-parity';
if (typeof window !== 'undefined') {
    window.__WRRAPD_CONTENT_BUILD_TAG__ = WRRAPD_CONTENT_BUILD_TAG;
}
