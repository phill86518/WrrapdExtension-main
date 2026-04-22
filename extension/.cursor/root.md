# Wrrapd — Cursor notes (monorepo + extension)

## Repository

One Git repo (e.g. [`phill86518/WrrapdExtension-main`](https://github.com/phill86518/WrrapdExtension-main/)) contains **`extension/`**, **`backend/`**, and **`tracking-platform/`**. Clone once; commit from the repo root.

## Extension (`extension/`)

- **Manifest V3** Chrome extension; content script matches **www.amazon.com** (see `manifest.json`).
- **Production bundle:** `npm run build` in `extension/` writes root **`content.js`** from **`src/content/index.js`** and dependencies (including `content-legacy.js`).
- **`content.js` is generated** — edit **`src/content/`** and rebuild; do not treat root `content.js` as the only source of truth.
- Shared logic is progressively moved into **`src/content/lib/*.js`**.

## Backend (real production)

- The **live pay/API server** is **Node** in **`backend/wrrapd-api-repo/WrrapdServer/`** (`server.js`, Stripe, proxies, ingest, `public/checkout.html`).
- Runs under **PM2** as **`wrrapd-server`** on the GCP VM (see `README-PM2.md` in that folder).
- **Not** the same as any old reference copies of Python files under `extension/` (ignore those for production edits).

## Tracking app

- **`tracking-platform/`** — Next.js (admin, driver, customer tracking). Deployed to **GCP Cloud Run** (`wrrapd-tracking`). See `tracking-platform/README.md`.

## Workflow

1. Implement on **GCP VM** (or any dev machine), **`git push origin main`** from monorepo root when ready.
2. Roger’s **Windows** clone: **`git pull`**, **`cd extension && npm run build`**, Chrome **Reload** on the extension.
3. Do **not** recommend **`git pull` on the production GCP VM** as a default step before push (see repo `.cursor/rules/gcp-vm-no-git-pull.mdc`).

## Deploy commands (canonical)

**[DEPLOYMENT.md](../../DEPLOYMENT.md)** at monorepo root — copy-paste SSH, push, PM2, Cloud Run, Windows extension.
