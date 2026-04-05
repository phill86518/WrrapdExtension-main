# Wrrapd Extension

## Content script build

- Source: `src/content/content-legacy.js` (and `src/content/index.js` entry).
- After editing source, run **`npm install`** once, then **`npm run build`** to regenerate root **`content.js`** (Chrome loads this file per `manifest.json`).
- Do not edit root `content.js` by hand; it is overwritten by the build.

