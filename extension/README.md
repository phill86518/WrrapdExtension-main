# Wrrapd Extension

## Windows — where to build (Roger’s machine)

After pulling from GitHub, run **`npm run build` inside the `extension` folder of this clone** — not on the GCP VM unless you are only using the VM as a build server.

**Canonical path (this user):**

- **Explorer / PowerShell:** `C:\Roger_Documents\Wrap-O-Matic\WRRAPD\CHROME EXTENSION\WrrapdExtension-main (main)`
- **Git Bash:** `/c/Roger_Documents/Wrap-O-Matic/WRRAPD/CHROME EXTENSION/WrrapdExtension-main (main)`

**Every deploy (from repo root — PowerShell or Git Bash):**

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

### Do I restart `wrrapd-server`?

- **On the GCP VM:** restart with `pm2 restart wrrapd-server` when you changed **`backend/wrrapd-api-repo/WrrapdServer`** (pay API, etc.). Not part of the Windows script above.
- **On Windows:** you normally do **not** run `wrrapd-server` for production.
- **Extension-only** updates: Windows commands + Chrome Reload are enough.
- **Tracking app:** deploy Cloud Run from the VM (or CI); not `pm2`.

## Content script build

- Source: `src/content/content-legacy.js` (and `src/content/index.js` entry).
- After editing source, run **`npm install`** once, then **`npm run build`** to regenerate root **`content.js`** (Chrome loads this file per `manifest.json`).
- **`npm run build`** produces a **minified** bundle (smaller file, fewer lines) — use for normal testing and shipping.
- **`npm run build:pretty`** produces the same bundle **without minification** (easier to read in `content.js` while debugging).
- Do not edit root `content.js` by hand; it is overwritten by the build.
- Shared helpers live under `src/content/lib/`: `dom-utils.js`, `storage.js`, `loading-ui.js`, `order-helpers.js`, `summary-alignment.js`, `zip-codes.js`, etc.

