# Extension Architecture (Multi-Retailer)

This document defines how Wrrapd extension code scales from Amazon-only to multiple retailers while keeping domain logic compartmentalized.

## Core principle

One retailer domain family = one content script bundle + one entry file + one adapter tree.

- Amazon: `content.js` from `extension/src/content/index.js`
- Target: `content-target.js` from `extension/src/content/target-index.js`
- Lego: `content-lego.js` from `extension/src/content/lego-index.js`

Chrome injects each bundle only where `manifest.json` `content_scripts.matches` allows it.

## Isolation rules

1. Amazon legacy (`content-legacy.js`) is Amazon-only.
2. Non-Amazon entries must not import Amazon-only DOM modules.
3. Shared code goes in retailer-agnostic modules only (API endpoints, generic helpers, shared payload shapes).
4. Every ingest payload must include `retailer` matching tracking-platform `OrderRetailer` values.

## Retailer folder pattern

For each new retailer:

- `extension/src/content/<retailer>-index.js`
- `extension/src/retailers/<retailer>/constants.js`
- `extension/src/retailers/<retailer>/...` (DOM selectors, extraction, mapping, feature flags)
- `package.json` scripts: `build:<retailer>` and optional `build:<retailer>:prod`
- `manifest.json`: `host_permissions`, `content_scripts`, and `web_accessible_resources.matches` entries

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
