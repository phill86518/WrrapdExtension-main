# Wrrapd Extension

## Content script build

- Source: `src/content/content-legacy.js` (and `src/content/index.js` entry).
- After editing source, run **`npm install`** once, then **`npm run build`** to regenerate root **`content.js`** (Chrome loads this file per `manifest.json`).
- **`npm run build`** produces a **minified** bundle (smaller file, fewer lines) — use for normal testing and shipping.
- **`npm run build:pretty`** produces the same bundle **without minification** (easier to read in `content.js` while debugging).
- Do not edit root `content.js` by hand; it is overwritten by the build.
- Shared helpers live under `src/content/lib/`: `dom-utils.js`, `storage.js`, `loading-ui.js`, `order-helpers.js`, `summary-alignment.js`, `zip-codes.js`, etc.

