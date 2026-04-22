# Chrome extension folder (`extension/`)

## Facts

- **Manifest V3** extension for **Amazon.com** checkout and cart flows.
- **Authoritative source:** `src/content/` (entry `src/content/index.js`). **`content.js`** in the extension root is the **esbuild bundle output** — regenerate with **`npm run build`** (or `npm run build:pretty`).
- **Backend for pay/API:** lives in **`../backend/wrrapd-api-repo/WrrapdServer/`** (Node). Edit there for `api.wrrapd.com` / Stripe / ingest — not under `extension/`.

## When editing

- Prefer small, focused changes in **`src/content/lib/`** for new cross-cutting helpers.
- **`content-legacy.js`** remains large; migrate carefully and rebuild after every change.
- After edits: **`cd extension && npm run build`** before Chrome Reload.

## Deploy

Windows build steps and paths: **`extension/README.md`**. Full stack: **`DEPLOYMENT.md`** at repo root.
