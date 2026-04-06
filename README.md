# Wrrapd (monorepo)

Single Git repository for the **Chrome extension** and the **Node payment/API server** (plus Python helpers under the server tree).

## Layout

| Path | What it is |
|------|------------|
| [`extension/`](extension/) | Manifest V3 extension — **Chrome “Load unpacked” must point at this folder** |
| [`backend/wrrapd-api-repo/WrrapdServer/`](backend/wrrapd-api-repo/WrrapdServer/) | Node `server.js`, `public/checkout.html` (pay.wrrapd.com), PM2, orders, Python API |

## GitHub

- **Remote:** [`phill86518/WrrapdExtension-main`](https://github.com/phill86518/WrrapdExtension-main/)
- **Clone:** `git clone https://github.com/phill86518/WrrapdExtension-main.git`
- **Extension on Windows:** Load unpacked → `...\WrrapdExtension-main\extension\` (not the repo root)

## Build extension (from `extension/`)

```bash
cd extension
npm install
npm run build
```

## Server (GCP)

PM2 `cwd` and `start-server.sh` use:

`/home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer`

Adjust if your home directory differs.

## Docs

- Extension Cursor notes: [`extension/.cursor/root.md`](extension/.cursor/root.md)
- Backend rules: [`backend/backend.md`](backend/backend.md)
