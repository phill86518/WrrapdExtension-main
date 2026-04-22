# Wrrapd Extension

Manifest V3 content script for **www.amazon.com** (see `manifest.json`). Checkout UX, gift options, Wrrapd pay summary, and post-pay **Place your order** integration.

## Windows — where to build (Roger’s machine)

After pulling from GitHub, run **`npm run build` inside the `extension` folder** of the Windows clone — not on the GCP VM unless you are intentionally using the VM only as a build host.

**Canonical path (this deployment):**

- **Explorer / PowerShell:** `C:\Roger_Documents\Wrap-O-Matic\WRRAPD\CHROME EXTENSION\WrrapdExtension-main (main)`
- **Git Bash:** `/c/Roger_Documents/Wrap-O-Matic/WRRAPD/CHROME EXTENSION/WrrapdExtension-main (main)`

**Every extension release (from repo root — PowerShell or Git Bash):**

```bash
git restore extension/content.js
git pull origin main
cd extension
npm install
npm run build
cd ..
```

Then Chrome → Extensions → Wrrapd → **Reload**.  
`git restore extension/content.js` clears a dirty/generated `content.js` so `git pull` is not blocked.

Full stack deploy order (VM push, PM2, Cloud Run, Windows): **[../DEPLOYMENT.md](../DEPLOYMENT.md)**.

## Source layout and build

- **Entry:** `src/content/index.js` (imports helpers, then legacy IIFE).
- **Legacy checkout / payment / cart:** `src/content/content-legacy.js` (large; being split over time).
- **Bundled output:** root **`content.js`** (minified). Chrome loads this per `manifest.json`.
- **Do not** edit `content.js` by hand; **`npm run build`** overwrites it.
- **`npm run build`** — production/minified (default).
- **`npm run build:pretty`** — same bundle without minify (easier to read `content.js` while debugging).

### `src/content/lib/` (shared modules)

Includes, among others:

- `amazon-account-signed-in.js` — Detects Amazon signed-in state via `#nav-link-accountList-nav-line-1` (vs “Hello, sign in”). Extension checkout behavior is gated on this.
- `amazon-delivery-hints.js` — Scrapes Wrrapd shipment **checked** delivery radios; writes `sessionStorage` for ingest / `process-payment`.
- `wrrapd-debug.js` — Optional HUD / trace (`localStorage wrrapd-trace=1`, etc.).
- Other helpers: `dom-utils.js`, `storage.js`, `loading-ui.js`, `order-helpers.js`, `summary-alignment.js`, `zip-codes.js`, etc.

**Verify build in DevTools:** `window.__WRRAPD_CONTENT_BUILD_TAG__` (set from `index.js`).

## Production behavior (summary)

1. **Signed out on Amazon:** Wrrapd does not inject checkout UI, does not disable Amazon controls, does not scrape delivery hints (hints cleared from `sessionStorage` when inactive).
2. **Signed in:** Normal Wrrapd flows on cart, gift, address, payment pages when Wrrapd gift-wrap is in play.
3. **After Pay Wrrapd succeeds:** **`attachWrrapdPlaceOrderTrackingHook`** intercepts the real **Place your order** click once: refreshes delivery hints, POSTs tracking ingest, then resubmits so Amazon places the order.

## Do I restart `wrrapd-server` on the VM?

- **Yes**, `pm2 restart wrrapd-server`, when **`backend/wrrapd-api-repo/WrrapdServer`** changed — not part of the Windows script above.
- **Extension-only:** Windows build + Chrome Reload only.
- **Tracking app:** Cloud Run deploy from VM; no PM2 for the Next.js app.

## Other markdown in this folder

- **[API_DEBUG_GUIDE.md](API_DEBUG_GUIDE.md)** — Debugging notes for AI / `generate-ideas`-style calls (legacy reference).
- **[CONVERSATION_HISTORY.md](CONVERSATION_HISTORY.md)** — Archival narrative of older extension work; not the live spec. Prefer this README + monorepo **DEPLOYMENT.md** for current process.
