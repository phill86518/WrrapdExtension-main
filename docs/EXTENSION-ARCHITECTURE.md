# Extension Architecture (Multi-Retailer)

This document defines how Wrrapd extension code scales from Amazon-only to multiple retailers while keeping domain logic compartmentalized.

## Core principle

One retailer domain family = one content script bundle + one entry file + one adapter tree.

- Amazon: `content.js` from `extension/src/content/index.js`
- Target: `content-target.js` from `extension/src/content/target-index.js`
- LEGO: `content-lego.js` from `extension/src/content/lego-index.js`
- Ulta, Walmart, Nordstrom, Kohl's, Sephora, Best Buy, Etsy: `content-<retailer>.js` from matching `extension/src/content/<retailer>-index.js`

Chrome injects each bundle only where `manifest.json` `content_scripts.matches` allows it.

## Isolation rules

1. Amazon legacy (`content-legacy.js`) is Amazon-only.
2. Non-Amazon entries must not import Amazon-only DOM modules.
3. Shared code goes in retailer-agnostic modules only (API endpoints, generic helpers, shared payload shapes).
4. Every ingest payload must include `retailer` matching tracking-platform `OrderRetailer` values.
5. Cart scrapers must scope to real cart/bag line containers and exclude recommendations/sponsored/related sections. Use `extension/src/shared/cart-scrape-region.js` for shared retailers.
6. Checkout gates must release the real retailer checkout/place-order button after Wrrapd payment success. Shared store adapters use `extension/src/shared/retailer-checkout-pay-flow.js`; LEGO has a custom equivalent.
7. Retailer delivery dates must pass sanity checks before being sent as concrete dates. Dates before today are stale and must fall back to generic retailer-date-plus-one wording.

## Retailer folder pattern

For each new retailer:

- `extension/src/content/<retailer>-index.js`
- `extension/src/retailers/<retailer>/constants.js`
- `extension/src/retailers/<retailer>/...` (DOM selectors, extraction, mapping, feature flags)
- `package.json` scripts: `build:<retailer>` and optional `build:<retailer>:prod`
- `manifest.json`: `host_permissions`, `content_scripts`, and `web_accessible_resources.matches` entries

Current non-Amazon retailer adapters:

| Retailer | Entry bundle | Flow notes |
|----------|--------------|------------|
| Target | `content-target.js` | Shared store opt-in + checkout pay flow |
| LEGO | `content-lego.js` | Custom LEGO checkout/pay flow; cart extraction must ignore recommendations |
| Ulta | `content-ulta.js` | Shared store opt-in + checkout pay flow |
| Walmart | `content-walmart.js` | Shared store opt-in + checkout pay flow |
| Nordstrom | `content-nordstrom.js` | Shared store opt-in + checkout pay flow |
| Kohl's | `content-kohls.js` | Shared store opt-in + checkout pay flow; skip concrete delivery-date capture |
| Sephora | `content-sephora.js` | Shared store opt-in + checkout pay flow |
| Best Buy | `content-bestbuy.js` | Shared store opt-in + checkout pay flow; current cart uses React fluid layout |
| Etsy | `content-etsy.js` | Shared store opt-in + checkout pay flow |

## Naming convention decision

- Keep Amazon on historic `content.js` for now to avoid churn in deployment scripts and references.
- New retailers use `content-<retailer>.js`.
- Future cleanup target: move Amazon to `content-amazon.js` for full symmetry when release risk/churn is acceptable.

## CSP / DNR strategy

`rules.json` should stay retailer-scoped and evidence-driven:

- Add retailer-specific rules only when DevTools confirms CSP/frame blocking.
- Do not copy Amazon header-removal rules to every retailer preemptively.

## Chrome Web Store note

Multiple content script files/entries are fully supported in Manifest V3.
Review risk is driven by broad permissions and unclear purpose, not by bundle count.

## Release / packaging

Windows is the extension testing and packaging machine after the VM pushes to GitHub:

```bash
git restore extension/
git pull origin main
cd extension
npm install
npm run build
```

After testing, create the store ZIP:

```bash
npm run build:store
```
