# Chrome Web Store upload pack

This folder holds **only** the files Google Chrome needs to load the extension. It must **not** include `src/`, `node_modules/`, tests, or other development files.

## Required files (mirror of repo `extension/` root)

| Path | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (MV3). |
| `content.js` | **Production** bundle from `npm run build` (not `build:dev`). |
| `rules.json` | Declarative Net Request rules referenced by `manifest.json`. |
| `assets/` | Entire directory tree: icons and any other `web_accessible_resources` (see `manifest.json`). |

Zip **the contents** of this folder (so `manifest.json` is at the root of the zip), not a parent directory.

**Security note:** The store package still contains `content.js` (minified). That is required for any extension that runs on Amazon. Logic you want hidden belongs on **api.wrrapd.com** / Cloud Run, not in the zip.

## Populate this folder (Git Bash on Windows)

From your **extension** repo root (the folder that contains `manifest.json`):

```bash
git restore extension/content.js
git pull origin main
cd extension
npm install
npm run build
bash scripts/pack-chrome-store.sh
```

The script copies the four items above into `CHROME WEB STORE/`. Then create the zip:

```bash
cd "CHROME WEB STORE"
zip -r ../wrrapd-chrome-store.zip manifest.json content.js rules.json assets
cd ..
```

Upload `wrrapd-chrome-store.zip` in the Chrome Web Store Developer Dashboard.

## Load unpacked (smoke test)

Chrome → Extensions → Developer mode → **Load unpacked** → select the `CHROME WEB STORE` folder (after running the pack script).
