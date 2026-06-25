# Wrrapd Extension

**Public install:** [Wrrapd on the Chrome Web Store](https://chromewebstore.google.com/detail/wrrapd/eampapdpkmnnbfdojhmbpckpljnbpapo). For development, use **Load unpacked** on this folder after `npm run build`.

Manifest V3 **multi-retailer** extension (see `manifest.json`): a **separate content script bundle per retailer domain**, not one script on all stores. Current build supports Amazon, Target, LEGO, Ulta, Walmart, Nordstrom, Kohl's, Sephora, Best Buy, and Etsy, with generated `content*.js` bundles committed for Chrome loading.

## Current release notes

**Version:** `2.0.15`

- Store-retailer checkout gates release after successful Wrrapd payment, including route-id success messages such as `bestbuy` / `kohls`.
- LEGO cart extraction is scoped to cart/bag containers so recommendation products do not become Wrrapd gift-wrap items.
- Shared recommendation filtering excludes related, sponsored, similar, popular, featured, and “complete your/this” sections.
- Retailer delivery-date capture ignores stale dates before today; uncertain dates fall back to generic retailer-date-plus-one wording.

## Windows — where to build (Roger’s machine)

After pulling from GitHub, run **`npm run build` inside the `extension` folder** of the Windows clone — not on the GCP VM unless you are intentionally using the VM only as a build host.

**Canonical path (this deployment):**

- **Explorer / PowerShell:** `C:\Roger_Documents\Wrap-O-Matic\WRRAPD\CHROME EXTENSION\WrrapdExtension-main (main)`
- **Git Bash:** `/c/Roger_Documents/Wrap-O-Matic/WRRAPD/CHROME EXTENSION/WrrapdExtension-main (main)`

**Every extension release (from repo root — PowerShell or Git Bash):**

```bash
git restore extension/
git pull origin main
cd extension
npm install
npm run build
cd ..
```

Then Chrome → Extensions → Wrrapd → **Reload**.  
`git restore extension/` clears **all** locally-modified/generated bundles so `git pull` is never blocked. Every `content*.js` (Amazon `content.js`, Target, Lego, Ulta, Walmart, Nordstrom, Kohl's, Sephora, Best Buy, Etsy) is a committed build artifact that `npm run build` regenerates after the pull; Windows is pull-and-build only. (Prefer `git stash` instead if you have local Windows edits to keep.) `npm install` may print harmless `EBADENGINE` warnings from `jsdom` on Node < 20.19 — `jsdom` is dev-only and not used by the build.

After browser testing passes, create the Chrome Web Store zip from `extension/`:

```bash
npm run build:store
```

Full stack deploy order (VM push, PM2, Cloud Run, Windows): **[../DEPLOYMENT.md](../DEPLOYMENT.md)**.

## Source layout and build

- **Amazon entry:** `src/content/index.js` → imports Amazon-only helpers, then **`content-legacy.js`** (IIFE).
- **Store-retailer entries:** `src/content/<retailer>-index.js` → one isolated bundle per retailer (`target`, `lego`, `ulta`, `walmart`, `nordstrom`, `kohls`, `sephora`, `bestbuy`, `etsy`).
- **Shared store flow:** `src/shared/cart-gift-optin.js`, `src/shared/retailer-checkout-pay-flow.js`, `src/shared/cart-scrape-region.js`, and `src/shared/retailer-delivery-date.js` hold cross-retailer behavior. Keep retailer DOM selectors under `src/retailers/<retailer>/`.
- **Bundled outputs (generated — do not edit by hand):**
  - **`content.js`** — Amazon; loaded only on `*://www.amazon.com/*` (`manifest.json` `content_scripts`).
  - **`content-target.js`** — Target; loaded only on `*://*.target.com/*`.
  - **`content-lego.js`** — LEGO; loaded only on `*://*.lego.com/*`.
  - **`content-ulta.js`**, **`content-walmart.js`**, **`content-nordstrom.js`**, **`content-kohls.js`**, **`content-sephora.js`**, **`content-bestbuy.js`**, **`content-etsy.js`** — store-retailer bundles.
- **`npm run build`** — builds every retailer bundle for local testing.
- **`npm run build:pretty`** — all bundles without minify (easier to read while debugging).
- **`npm run build:prod`** — all retailer bundles with production flags from `package.json`.
- **`npm run build:store`** — production build plus Chrome Web Store zip packaging.
- **Legacy Amazon checkout / cart / pay:** `src/content/content-legacy.js` (large; refactor only inside Amazon paths).

### Naming convention for more retailers

- **Amazon** keeps the historic name **`content.js`** / entry `index.js` (avoids churn in docs, Roger’s flow, and older references).
- **Every other retailer:** `content-<retailer>.js` from `src/content/<retailer>-index.js` (e.g. `content-target.js`, `content-lego.js`). Add a matching `content_scripts` block and `host_permissions` / `web_accessible_resources.matches` in `manifest.json`, plus a `build:<retailer>` script chained from `npm run build`.
- **Future symmetry note:** Keep Amazon on historic `content.js` for now. Planned future cleanup can rename to `content-amazon.js` once deployment/docs churn is acceptable.

## Multi-retailer architecture (isolation + Chrome Web Store)

### Only Amazon code on Amazon; only Target code on Target

Chrome injects scripts **only** on URLs matched by each `content_scripts` entry. With the current manifest:

| Host pattern        | Script(s) loaded   | What runs                                      |
|---------------------|--------------------|------------------------------------------------|
| `www.amazon.com`    | `content.js`       | Full Amazon legacy checkout / pay integration |
| `*.target.com`      | `content-target.js`| Target-only bundle (no Amazon legacy)         |
| `*.lego.com`        | `content-lego.js`  | LEGO-only bundle (custom checkout flow)       |
| `*.ulta.com`        | `content-ulta.js`  | Ulta store-retailer shared flow               |
| `*.walmart.com`     | `content-walmart.js` | Walmart store-retailer shared flow          |
| `*.nordstrom.com`   | `content-nordstrom.js` | Nordstrom store-retailer shared flow      |
| `*.kohls.com`       | `content-kohls.js` | Kohl's store-retailer shared flow             |
| `*.sephora.com`     | `content-sephora.js` | Sephora store-retailer shared flow          |
| `*.bestbuy.com`     | `content-bestbuy.js` | Best Buy store-retailer shared flow         |
| `*.etsy.com`        | `content-etsy.js`  | Etsy store-retailer shared flow               |

**Rules of thumb**

1. **Never** import `content-legacy.js` (or `src/content/lib/*` Amazon-only modules) from the Target entry.
2. **Shared** code should be retailer-agnostic (cart opt-in, pay gating, recommendation exclusion, delivery-date sanity checks, constants, `fetch` to `api.wrrapd.com`, types). If something touches Amazon DOM or ASINs, it stays in the Amazon tree (`src/retailers/amazon/`, legacy, etc.).
3. Tracking ingest payloads must set **`retailer`** (`Amazon` \| `Target` \| …) to match [tracking-platform](../tracking-platform) `OrderRetailer` (see pay server + `parseIngestOrderPayload`).

### Does Chrome Web Store allow multiple content JavaScript files?

**Yes.** Manifest V3 explicitly supports:

- Several **`content_scripts`** entries (each with its own `matches` and `js` array), and/or  
- Multiple files in one entry’s **`js`** array.

This is normal and widely used (e.g. one bundle per major site). It is **not** inherently a review problem. Reviewers care that **host permissions and `matches` are narrow and justified**, that the **privacy policy and single purpose** match what you do, and that you **do not** request broader access than needed. Splitting by retailer **reduces** risk versus one giant script with `<all_urls>`.

### `rules.json` (DeclarativeNetRequest)

Today CSP-related header rules are scoped to **Amazon** only. If Target checkout blocks the extension, add a **separate** rule with a **narrow** `urlFilter` for Target—**after** you confirm in DevTools that CSP (or framing) is the issue. Do not copy Amazon DNR to Target “just in case” without evidence.

### `src/content/lib/` (Amazon bundle only)

These are imported from **`src/content/index.js`** (Amazon). The Target entry should not depend on them unless you later extract truly shared, DOM-free utilities into `src/shared/`.

Includes, among others:

- `amazon-account-signed-in.js` — Detects signed-in state: explicit **“Hello, sign in”** in the account nav → inactive; **“Hello, &lt;Name&gt;”** on line-1 → active. On **cart / checkout / gp/buy** URLs the full navbar is often missing—if we do not see an explicit sign-in greeting, we **assume active** (same authenticated tab; not server-side cookie scraping).
- `amazon-delivery-hints.js` — Scrapes Wrrapd shipment **checked** delivery radios; writes `sessionStorage` for ingest / `process-payment`.
- `wrrapd-debug.js` — Optional HUD / trace (`localStorage wrrapd-trace=1`, etc.).
- Other helpers: `dom-utils.js`, `storage.js`, `loading-ui.js`, `order-helpers.js`, `summary-alignment.js`, `zip-codes.js`, etc.

**Verify builds in DevTools:** `window.__WRRAPD_CONTENT_BUILD_TAG__` on Amazon (from `index.js`); `window.__WRRAPD_TARGET_CONTENT_BUILD__` on Target (from `target-index.js`).

## Production behavior (summary)

1. **Signed out on Amazon:** Wrrapd does not inject checkout UI, does not disable Amazon controls, does not scrape delivery hints (hints cleared from `sessionStorage` when inactive).
2. **Signed in:** Normal Wrrapd flows on cart, gift, address, payment pages when Wrrapd gift-wrap is in play.
3. **After Pay Wrrapd succeeds:** Amazon’s **`attachWrrapdPlaceOrderTrackingHook`** intercepts the real **Place your order** click once: refreshes delivery hints, POSTs tracking ingest, then resubmits so Amazon places the order. Store retailers release the real checkout/place-order button after `retailer-checkout-pay-flow.js` confirms payment and fills the Wrrapd hub address.

## Do I restart `wrrapd-server` on the VM?

- **Yes**, `pm2 restart wrrapd-server`, when **`backend/wrrapd-api-repo/WrrapdServer`** changed — not part of the Windows script above.
- **Extension-only:** Windows build + Chrome Reload only.
- **Tracking app:** Cloud Run deploy from VM; no PM2 for the Next.js app.

## Other markdown in this folder

- **[API_DEBUG_GUIDE.md](API_DEBUG_GUIDE.md)** — Debugging notes for AI / `generate-ideas`-style calls (legacy reference).
- **[CONVERSATION_HISTORY.md](CONVERSATION_HISTORY.md)** — Archival narrative of older extension work; not the live spec. Prefer this README + monorepo **DEPLOYMENT.md** for current process.
