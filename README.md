# Wrrapd (monorepo)

Single Git repository for the **Chrome extension** (Amazon checkout), the **Node pay/API server** (`api.wrrapd.com` / `pay.wrrapd.com`), and the **tracking web app** (admin, driver, customer tracking on Cloud Run).

## Layout

| Path | What it is |
|------|------------|
| [`extension/`](extension/) | Manifest V3 extension — [Chrome Web Store](https://chromewebstore.google.com/detail/wrrapd/eampapdpkmnnbfdojhmbpckpljnbpapo) for shoppers; **Load unpacked** for dev. Source under `src/content/`; bundled to root `content.js`. |
| [`backend/wrrapd-api-repo/WrrapdServer/`](backend/wrrapd-api-repo/WrrapdServer/) | Node `server.js`, `public/checkout.html`, PM2 process **`wrrapd-server`**, Stripe, proxies, order ingest. |
| [`tracking-platform/`](tracking-platform/) | Next.js app: ops hub at `/`, admin `/admin`, driver `/driver`, public `/track/[token]`. Deployed to **Cloud Run** (`wrrapd-tracking`). |

## GitHub

- **Remote:** [`phill86518/WrrapdExtension-main`](https://github.com/phill86518/WrrapdExtension-main/)
- **Clone:** `git clone https://github.com/phill86518/WrrapdExtension-main.git`

## Chrome Web Store (public install)

- **Wrrapd (live):** [Chrome Web Store listing](https://chromewebstore.google.com/detail/wrrapd/eampapdpkmnnbfdojhmbpckpljnbpapo)

## Copy-paste deployment (canonical)

**→ [DEPLOYMENT.md](DEPLOYMENT.md)** — SSH, VM `git push`, PM2 when backend changes, Cloud Run when tracking changes, Windows extension build + Reload.

Workflow expectation: changes are committed on the **GCP VM** and **pushed** to GitHub; Roger’s **Windows** clone **pulls** and **builds** the extension. Do **not** default to `git pull` on the production VM before push (see `.cursor/rules/gcp-vm-no-git-pull.mdc`).

## Extension build (quick reference)

```bash
cd extension
npm install
npm run build
```

Do not hand-edit root `extension/content.js`; the build overwrites it.

## Server on GCP (PM2)

Typical paths on the VM:

`/home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer`

Adjust if your home directory differs. See [backend/wrrapd-api-repo/WrrapdServer/README-PM2.md](backend/wrrapd-api-repo/WrrapdServer/README-PM2.md).

## Product / engineering notes (high level)

- **Amazon sign-in:** Gated on nav text when present; on **cart / checkout / gp/buy** we assume the tab is signed-in unless we see an explicit **“Hello, sign in”** (checkout often omits `#nav-link-accountList-nav-line-1` until late). See `extension/src/content/lib/amazon-account-signed-in.js`.
- **Place your order:** After **Pay Wrrapd** succeeds, tracking ingest runs on Amazon’s real **Place your order** control, then Amazon submit proceeds.
- **Delivery dates:** Hints use **Wrrapd-address** shipment rows and **checked** delivery radios only; multi-address must not merge other recipients’ dates (`amazon-delivery-hints.js`).
- **Tracking UI:** Firestore-backed; ingest from pay server / extension must match expected recipient fields (see `tracking-platform/README.md`).

## Docs index

| Doc | Purpose |
|-----|---------|
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | **Copy-paste deploy commands (canonical)** |
| [docs/CUSTOMER-ACCOUNTS-AND-ORDER-HISTORY.md](docs/CUSTOMER-ACCOUNTS-AND-ORDER-HISTORY.md) | Guest vs account, order backfill, customer numbers, SQL vs JSON vs Supabase |
| [docs/INTEGRATION-MAP.md](docs/INTEGRATION-MAP.md) | Extension ↔ pay server ↔ tracking ↔ WordPress (and `wrrapd-logins` GCP) |
| [docs/WORDPRESS-SITE-EDITS-LOG.md](docs/WORDPRESS-SITE-EDITS-LOG.md) | Changelog of Elementor / Hello CSS / DB-touch site work |
| [docs/GCP-WRRAPD-LOGINS-ACCESS.md](docs/GCP-WRRAPD-LOGINS-ACCESS.md) | IAM and `gcloud`: access `wrrapd-logins` vs `wrrapd-chrome-extension` |
| [extension/README.md](extension/README.md) | Extension build, Windows paths, content layout |
| [extension/.cursor/root.md](extension/.cursor/root.md) | Cursor / monorepo workflow |
| [backend/backend.md](backend/backend.md) | Backend (Node) conventions |
| [backend/wrrapd-api-repo/WrrapdServer/README.md](backend/wrrapd-api-repo/WrrapdServer/README.md) | Pay/API server overview |
| [backend/wrrapd-api-repo/WrrapdServer/README-PM2.md](backend/wrrapd-api-repo/WrrapdServer/README-PM2.md) | PM2 operations |
| [tracking-platform/README.md](tracking-platform/README.md) | Tracking app, Cloud Run, env |
| [.cursor/rules/wrrapd-deploy-sequence.mdc](.cursor/rules/wrrapd-deploy-sequence.mdc) | Cursor: deploy order rule |
