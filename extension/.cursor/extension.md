# Chrome extension folder (`extension/`)

## Facts

- **Manifest V3** multi-retailer extension for Amazon, Target, LEGO, Ulta, Walmart, Nordstrom, Kohl's, Sephora, Best Buy, and Etsy cart/checkout flows.
- **Authoritative source:** `src/content/`, `src/retailers/`, and `src/shared/`. Root **`content*.js`** files are **esbuild bundle outputs** — regenerate with **`npm run build`** (or `npm run build:pretty`).
- **Backend for pay/API:** lives in **`../backend/wrrapd-api-repo/WrrapdServer/`** (Node). Edit there for `api.wrrapd.com` / Stripe / ingest — not under `extension/`.

## When editing

- Prefer small, focused changes in **`src/shared/`** for retailer-agnostic helpers and **`src/retailers/<retailer>/`** for DOM selectors/adapters.
- **`content-legacy.js`** remains Amazon-only and large; migrate carefully and rebuild after every change.
- After edits: **`cd extension && npm run build`** before Chrome Reload.

## Deploy

Windows build steps and paths: **`extension/README.md`**. Full stack: **`DEPLOYMENT.md`** at repo root.
