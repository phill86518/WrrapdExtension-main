/**
 * Entry for the bundled content script. The legacy script is still one IIFE;
 * we import it for side effects until the code is split into real modules.
 */
import './content-legacy.js';
import './lib/amazon-delivery-hints.js';

/** Bump when verifying deploy — search Amazon tab DevTools console for this string. */
export const WRRAPD_CONTENT_BUILD_TAG = '2026-04-13-postpay-staging-button-looks-enabled';
console.info(
    '[Wrrapd] content bundle',
    WRRAPD_CONTENT_BUILD_TAG,
    '— if this line is missing after reload, Chrome is not using the built content.js.',
);
