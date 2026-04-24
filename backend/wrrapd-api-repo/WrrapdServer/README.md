# WrrapdServer (Node pay / API)

Node service behind **`api.wrrapd.com`** and related flows: Stripe payments, `public/checkout.html` (e.g. **pay.wrrapd.com**), order processing, Mailgun, Firestore, and proxies to the tracking platform (e.g. ingest).

## Run and deploy

- **Production (GCP VM):** managed with **PM2** as **`wrrapd-server`**. See **[README-PM2.md](README-PM2.md)** for commands, logs, and health checks.
- **After code or dependency changes on the VM:**

```bash
cd /home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer
npm install
pm2 restart wrrapd-server
curl -sS http://127.0.0.1:8080/health
```

## Monorepo context

This directory lives inside the same Git repo as **`extension/`** and **`tracking-platform/`**. Full **copy-paste** deploy (VM push, when to restart PM2, Cloud Run, Windows extension): **[../../../DEPLOYMENT.md](../../../DEPLOYMENT.md)**.

## Environment

Secrets and env vars (Stripe, Mailgun, session secrets, etc.) are **not** committed here. Configure on the VM / process manager / hosting panel as you already do for production.

### Guest → WordPress order claim (Phase 2)

- **`WRRAPD_INTERNAL_CLAIM_SECRET`** — long random string. Required for **`POST https://api.wrrapd.com/api/internal/claim-orders-by-email`**. Send the same value in header **`X-Wrrapd-Internal-Key`**. WordPress (or another trusted server) should call this over HTTPS with the logged-in user’s email + `wpUserId`; **never** expose this secret in the browser.
- After setting or changing it: **`pm2 restart wrrapd-server`**.

Example (dry run — no writes):

```bash
curl -sS -X POST 'https://api.wrrapd.com/api/internal/claim-orders-by-email' \
  -H 'Content-Type: application/json' \
  -H "X-Wrrapd-Internal-Key: $WRRAPD_INTERNAL_CLAIM_SECRET" \
  -d '{"email":"shopper@example.com","wpUserId":"129","dryRun":true}'
```
