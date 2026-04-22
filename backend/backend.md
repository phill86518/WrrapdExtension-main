# Backend — Wrrapd (`backend/`)

## What “the backend” is in this repo

Production services for Wrrapd are primarily:

| Area | Path | Runtime | Notes |
|------|------|---------|--------|
| **Pay / API / ingest proxy** | `wrrapd-api-repo/WrrapdServer/` | **Node** (`server.js`) | Stripe, `checkout.html`, Mailgun, Firestore, routes such as `process-payment`, proxy to tracking ingest. **PM2 name: `wrrapd-server`.** |

Other directories under `backend/` may contain helpers or historical artifacts; treat **`WrrapdServer`** as the source of truth for the live API unless a task explicitly points elsewhere.

## Editing rules

- Implement and deploy **Node** changes in **`backend/wrrapd-api-repo/WrrapdServer/`**.
- Do **not** use copies of server code inside **`extension/`** as the place to fix production API behavior.
- After deploying server changes on the GCP VM: **`pm2 restart wrrapd-server`** and **`curl http://127.0.0.1:8080/health`**.

## Deploy and ops

- **Copy-paste sequence:** [../DEPLOYMENT.md](../DEPLOYMENT.md)
- **PM2:** [wrrapd-api-repo/WrrapdServer/README-PM2.md](wrrapd-api-repo/WrrapdServer/README-PM2.md)
- **Server README:** [wrrapd-api-repo/WrrapdServer/README.md](wrrapd-api-repo/WrrapdServer/README.md)

## Ingest / tracking

Order rows and emails often depend on **`WRRAPD_INGEST_VERSION`** and ingest merge logic in `server.js` plus the **Chrome extension** payload (Amazon delivery hints, giftee address). If Admin/Driver/email disagree, verify extension version, hint keys, and Firestore merge history (see `tracking-platform/README.md`).
