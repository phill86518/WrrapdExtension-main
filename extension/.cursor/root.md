# Wrrapd — Cursor notes (monorepo + extension)

## Repository

One Git repo (e.g. [`phill86518/WrrapdExtension-main`](https://github.com/phill86518/WrrapdExtension-main/)) contains **`extension/`**, **`backend/`**, and **`tracking-platform/`**. Clone once; commit from the repo root.

## Extension (`extension/`)

- **Manifest V3** multi-retailer Chrome extension; `manifest.json` uses one content script bundle per retailer host.
- **Production bundles:** `npm run build` in `extension/` writes root **`content*.js`** files from **`src/content/*-index.js`** entries and dependencies.
- **Root `content*.js` files are generated** — edit **`src/content/`**, **`src/retailers/`**, and **`src/shared/`**, then rebuild.
- Shared non-Amazon retailer logic lives in **`src/shared/*.js`**; Amazon-only legacy logic remains in `src/content/content-legacy.js`.

## Backend (real production)

- The **live pay/API server** is **Node** in **`backend/wrrapd-api-repo/WrrapdServer/`** (`server.js`, Stripe, proxies, ingest, `public/checkout.html`).
- Runs under **PM2** as **`wrrapd-server`** on the GCP VM (see `README-PM2.md` in that folder).
- **Not** the same as any old reference copies of Python files under `extension/` (ignore those for production edits).

## Tracking app

- **`tracking-platform/`** — Next.js (admin, driver, customer tracking). Deployed to **GCP Cloud Run** (`wrrapd-tracking`). See `tracking-platform/README.md`.

## Workflow

1. Implement on **GCP VM** (or any dev machine), **`git push origin main`** from monorepo root when ready.
2. Roger’s **Windows** clone: **`git restore extension/`**, **`git pull origin main`**, **`cd extension && npm install && npm run build`**, Chrome **Reload** on the extension. After testing, run **`npm run build:store`** from `extension/` to create the Chrome Web Store zip.
3. Do **not** recommend **`git pull` on the production GCP VM** as a default step before push (see repo `.cursor/rules/gcp-vm-no-git-pull.mdc`).

## Deploy commands (canonical)

**[DEPLOYMENT.md](../../DEPLOYMENT.md)** at monorepo root — copy-paste SSH, push, PM2, Cloud Run, Windows extension.
