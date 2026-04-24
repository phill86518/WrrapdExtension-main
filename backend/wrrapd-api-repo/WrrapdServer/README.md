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

### Guest → WordPress order claim (Phase 2) + list (Phase 3)

- **`WRRAPD_INTERNAL_CLAIM_SECRET`** — long random string. Required for internal routes below. Send the same value in header **`X-Wrrapd-Internal-Key`**. Only **trusted server code** (e.g. WordPress `mu-plugins` on `wrrapd.com`) should call these; **never** expose this secret in the browser.
- After setting or changing it: **`pm2 restart wrrapd-server`**.

**`POST /api/internal/claim-orders-by-email`** — stamps `claimedWpUserId` on `orders/order_*.json` where gifter email matches. Body: `email` or `emailNorm`, `wpUserId`, optional `dryRun`.

**`POST /api/internal/orders-for-wp-user`** — returns order summaries for the Review UI. Body must include **`email`** (or `emailNorm`) **and** `wpUserId` (same pairing WordPress has for the logged-in user).

Example (dry run — no writes):

```bash
curl -sS -X POST 'https://api.wrrapd.com/api/internal/claim-orders-by-email' \
  -H 'Content-Type: application/json' \
  -H "X-Wrrapd-Internal-Key: $WRRAPD_INTERNAL_CLAIM_SECRET" \
  -d '{"email":"shopper@example.com","wpUserId":"129","dryRun":true}'
```

Monorepo MU plugin + install notes: **[../../../wordpress/README.md](../../../wordpress/README.md)**.
