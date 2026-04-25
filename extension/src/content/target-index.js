/**
 * Target.com content script entry (separate bundle from Amazon `content.js`).
 * Checkout / cart DOM integration will live under `src/retailers/target/`.
 * This stub loads on Target origins declared in manifest.json so adding
 * `host_permissions` + `content_scripts` ships in one CWS submission.
 */
if (typeof window !== 'undefined') {
    window.__WRRAPD_TARGET_CONTENT_BUILD__ = '2026-04-25-stub';
}
