# Customer accounts, guest checkout, and unified order history

This document describes the **product goal** (guest-friendly extension + encouraged `wrrapd.com` accounts + full history after signup), the **current technical reality** in this monorepo, and a **phased plan** that can be implemented without “big bang” risk.

It also answers: **SQL vs JSON files vs Supabase** for order and customer data.

---

## Product goal (what “done” looks like)

1. **Guests** may use the Chrome extension on Amazon and complete Wrrapd-paid flows **without** creating a `wrrapd.com` WordPress account.
2. The site **encourages** registration or social login (Google / Amazon) on `wrrapd.com`.
3. When a person first creates an account (or logs in for the first time) using an **email address that already appears on historical Wrrapd orders**, **all prior orders** for that identity should become visible when they use **“Review Wrrapd Orders”** (or equivalent).
4. Each distinct customer identity should receive a stable **Customer number** (internal id) that survives WordPress user id quirks and can be printed on receipts, emails, and support tickets.

Non-goals for v1 (unless you explicitly expand scope):

- Merging two different emails into one customer without strong verification.
- Proving Amazon account identity matches WordPress identity beyond whatever signals you choose (email is the usual bridge).

---

## Current reality (this repo + production shape)

### Where orders live today

| Layer | Role | Persistence |
|--------|------|-------------|
| **Chrome extension** | Runs on Amazon; collects cart / gift options; drives checkout and pay flow | Browser state, `localStorage` where used; **not** the system of record for completed orders |
| **`WrrapdServer`** (`api.wrrapd.com` / `pay.wrrapd.com`) | Stripe checkout, payment confirmation, emails, order payloads | **`orders/order_*.json`** on the VM under `WrrapdServer/orders/` — see `saveOrderToJsonFile` in `server.js` |
| **Tracking platform** (Cloud Run) | Ops / driver / customer tracking; ingest API | **Firestore** `orders` collection when configured; local `.data/orders.json` fallback in dev — see `tracking-platform/src/lib/data.ts` |
| **WordPress (`wrrapd.com`)** | Marketing, Elementor pages, login (Google/Amazon plugins), WooCommerce or custom buttons | **MySQL** (`dfy_*` tables in production) — **not** currently the canonical store for extension-originated order blobs |

**Important:** Order JSON on the pay server already includes **`customer.email`** (and related fields) when the flow supplies it. That email string is the natural **join key** to WordPress `user_email` after normalization (trim, lowercase).

### What does *not* exist yet (gap)

- A single **authoritative “customer registry”** keyed by normalized email with a **customer number**.
- A **reconciliation job** that runs on `user.register` / `wp_login` (or OAuth callback) to attach `wp_user_id` (and customer number) to all historical orders for that email across **JSON + Firestore** (and any future DB).
- A **secure “my orders” API** that WordPress (or a small BFF on the VM) calls with the logged-in user’s session, returning merged history for the UI behind **“Review Wrrapd Orders”**.

Until those exist, the welcome page button may link to a page that cannot yet list server-side history for pre-account guests.

---

## Identity model (recommended)

### Canonical customer key

- **`customer_email_norm`** = `lower(trim(email))` for the paying / notifying email captured at checkout (Stripe / ingest).
- Optional later: **`amazon_payer_hint`** or hashed token if you must correlate when email is missing (rare for Wrrapd gift flow if you require email for pay).

### Customer number

- Issue **`wrrapd_customer_id`** = UUID (or opaque ULID) the **first time** you see a new `customer_email_norm` on a successful payment or ingest.
- Store it on:
  - each order record (JSON row / Firestore document / future SQL row),
  - WordPress **`usermeta`** for the WP user once they register (`wrrapd_customer_id`),
  - a small **`customer_directory`** table or collection `{ email_norm, customer_id, created_at, wp_user_id? }`.

### Linking on WordPress login / registration

1. Resolve **normalized email** for the WP user.
2. **Upsert** customer row: if no `wrrapd_customer_id`, create one.
3. **Scan** order store(s) for `customer.email` (normalized) matching; set `claimed_by_wp_user_id` and `wrrapd_customer_id` on each order if missing (idempotent).
4. **Enqueue** heavy backfills (thousands of JSON files) asynchronously rather than blocking the login request.

---

## JSON files vs SQL vs Supabase (recommendation)

### JSON files only (status quo on VM)

**Pros:** Simple, already working, no new billable service.  
**Cons:** Hard to query “all orders for email X” at scale; concurrent writes and backups are manual; no transactions. **Not** a good long-term foundation for a Shopify-like “my orders” experience if volume grows.

**Verdict:** Keep JSON as an **append-only archive** or migration source if you want, but **do not** build the customer dashboard primarily on “grep the filesystem.”

### Traditional SQL (self-hosted Postgres, Cloud SQL, etc.)

**Pros:** Strong queries, constraints, migrations, reporting; one place for `customers`, `orders`, `order_events`.  
**Cons:** You operate backups, connection pooling, and networking from WordPress + VM + Cloud Run.

**Verdict:** Excellent if you want **one** operational database you own end-to-end.

### Supabase (hosted Postgres + optional Auth / Realtime)

**Pros:** Postgres with good DX, APIs, row-level security patterns; free tier for early stage.  
**Cons:** Another vendor and **data locality** decisions; you still must **design** schema and **not** duplicate WordPress auth unless you intentionally migrate auth.

**Verdict:** A **reasonable** choice for a **new** “orders + customers” service **if** you want Postgres without running Cloud SQL yourself. It does **not** magically replace WordPress or Firestore; you **sync** or **migrate** into it.

### Firestore (already used by tracking)

**Pros:** Already ingests operational orders; horizontal scale; fits Cloud Run.  
**Cons:** Different query patterns than SQL; reporting often needs export or BigQuery.

**Verdict:** Strong candidate for **“order headers + customer ids + wp link”** if you want minimal new infrastructure: extend ingest and documents with `customer_email_norm`, `wrrapd_customer_id`, `claimed_wp_user_id`, then add a **Cloud Function or Next route** (admin-protected or session-token) to list by customer.

### Practical recommendation (staged)

1. **Stage A — No new DB yet:** **(Done in repo, 2026-04)** `customerEmailNorm` + `wrrapdCustomerId` on **VM order JSON** (`WrrapdServer` → `saveOrderToJsonFile`) and on **tracking ingest** → Firestore `Order` documents. Registry file: `WrrapdServer/customers/email_to_customer_id.json` (gitignored). **Deploy:** VM `pm2 restart` + Cloud Run image when you ship.
2. **Stage A2 — Claim API (Phase 2, repo):** **`POST /api/internal/claim-orders-by-email`** on **`api.wrrapd.com`** with header **`X-Wrrapd-Internal-Key`** = env **`WRRAPD_INTERNAL_CLAIM_SECRET`**. Stamps `claimedWpUserId` + `claimedAt` on matching `orders/order_*.json` (idempotent; reports conflicts if another WP user already claimed).
3. **Stage A3 — WordPress bridge + list (Phase 3, repo):** MU plugin **`wordpress/wrrapd-orders-bridge.php`** — `wp_login` + `user_register` call claim; shortcode **`[wrrapd_review_orders]`** calls **`POST /api/internal/orders-for-wp-user`** (same header/secret). Deploy: copy to **`wp-content/mu-plugins/`**, define **`WRRAPD_INTERNAL_API_KEY`** (+ optional **`WRRAPD_API_BASE`**) in **`wp-config.php`**, add shortcode to the Review page. Pay server: **`pm2 restart`** after pull.
4. **Stage B — If reporting or joins hurt:** Add **Postgres** (Supabase **or** Cloud SQL) as a **read model** fed by webhook or nightly job; WordPress reads “my orders” from that API.
5. **Avoid** “JSON files as the only queryable store” beyond early prototyping.

---

## GCP project `wrrapd-logins` vs this monorepo

OAuth client IDs / consent screens / secrets for Google and Amazon logins often live in a **dedicated GCP project** (your **Wrrapd-Logins** project). That is **orthogonal** to where order bytes live:

- **Logins project:** identity provider credentials, maybe Cloud Functions for token exchange.
- **App / media project:** VM, Cloud Run, buckets (`wrrapd-media`, etc.).

Bridging is **contract + HTTPS**, not “same GCP folder.” Document client IDs, redirect URIs, and which **WordPress plugin** owns the callback in [`INTEGRATION-MAP.md`](INTEGRATION-MAP.md).

---

## Honest delivery note

Implementing **everything** (customer number, backfill, secure my-orders API, WordPress UI, sparse welcome page redesign) is **multi-sprint** work across:

- `WrrapdServer` (write metadata, optional internal API),
- `tracking-platform` (schema fields + query path),
- WordPress (hooks, page for “Review orders”, Elementor),
- optionally **Supabase/Postgres** if you choose Stage B.

This repo can hold the **spec and phased tasks**; execution should land as **small PRs** with tests on normalization and idempotent claiming to avoid double-attaching orders.

---

## Related documents

- [`INTEGRATION-MAP.md`](INTEGRATION-MAP.md) — extension ↔ API ↔ tracking ↔ WordPress flow.
- [`WORDPRESS-SITE-EDITS-LOG.md`](WORDPRESS-SITE-EDITS-LOG.md) — site-side edits log (Elementor, Hello theme CSS, etc.).
