# Wrrapd White-Labeled Tracking Platform

Single-codebase delivery tracking platform built for low volume and GCP free-tier-first operation.

## Included Phases

- **Phase 1 (Command Center):** `/admin`
  - Login, create order, active/scheduled/past views
  - Assign driver, update status, view order details
- **Phase 2 (Driver Companion):** `/driver`
  - Mobile login, start delivery, GPS broadcast, proof upload
- **Phase 3 (Customer Experience):** `/track/[token]`
  - Live status, ETA, map iframe, proof-of-delivery photo

## Local Run

1. Copy environment template:
   - `cp .env.example .env.local`
2. Run:
   - `npm install`
   - `npm run dev`
3. Open:
   - `http://localhost:3000`

## Use from Windows, phones, or tablets (this is required for real demos)

`npm run dev` on a **remote server** only listens on that machine’s loopback. Your Windows PC and drivers’ phones **cannot** open `http://localhost:3000` on the VM — that URL is wrong for them.

Pick **one** of these:

### Option A — Recommended: deploy to Cloud Run (HTTPS URL for everyone)

Same app, one public URL. Drivers and customers get **HTTPS**, which many phones require for **GPS** and camera.

Follow **Cloud Run Deployment** below, then open the `https://....run.app` URL on Windows and on mobile.

### Option B — SSH tunnel from Windows (good for quick admin checks)

On **Windows** (PowerShell or Git Bash), after SSH is set up:

```bash
ssh -L 3000:127.0.0.1:3000 admin_@wrrapd-server-1
```

Leave that session open. On Windows, open **http://localhost:3000**.  
(Phones **cannot** use this unless you add more tunneling; use Option A for drivers.)

### Option C — Listen on the LAN / VM IP (demo only, often HTTP-only)

On the server:

```bash
npm run dev:public
```

Open **http://&lt;server-internal-or-external-IP&gt;:3000** from Windows **only if** your firewall / VPC allows TCP **3000**.

**Caveats:**

- **Geolocation** on many mobile browsers needs **HTTPS** (localhost is an exception). Plain `http://10.x.x.x:3000` may block or limit GPS — prefer **Cloud Run** for driver testing.
- Opening port 3000 to the public internet is **not** a production pattern; use Cloud Run + auth for anything beyond a short internal test.

### Production-style run on the VM (after `npm run build`)

```bash
npm run build
npm run start:public
```

Still use HTTPS in front (load balancer, Cloud Run, or reverse proxy) before you ask drivers to rely on GPS uploads.

## Environment Separation

- Keep two Cloud Run services and env sets:
  - `wrrapd-tracking-dev`
  - `wrrapd-tracking-prod`
- Store secrets separately per environment in GitHub Actions and/or Secret Manager.
- Use `workflow_dispatch` in `.github/workflows/tracking-platform-cloud-run.yml` to deploy intentionally.

## Default Credentials (MVP)

- Admin password: `admin123`
- Driver passcode: `driver123`

Change these with env vars before production deployment.

## Cloud Run Deployment

Build and deploy (from this folder):

```bash
gcloud builds submit --tag gcr.io/$GOOGLE_CLOUD_PROJECT/wrrapd-tracking
gcloud run deploy wrrapd-tracking \
  --image gcr.io/$GOOGLE_CLOUD_PROJECT/wrrapd-tracking \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars APP_SESSION_SECRET=change-me,APP_ADMIN_PASSWORD=change-me,APP_DRIVER_PASSWORD=change-me
```

### Production persistence (Firestore — required on Cloud Run)

Cloud Run instances use **ephemeral disk**. Without Firestore, orders/drivers/availability reset when the container recycles.

1. In [Firebase Console](https://console.firebase.google.com/) (same GCP project), enable **Firestore** (Native mode, e.g. `us-central`).
2. Create a **service account** with **Firebase Admin** or roles that include Firestore read/write (e.g. **Cloud Datastore User**). Create a JSON key.
3. On the Cloud Run service, set (use your real values; keep the private key as one line with `\n` for newlines):

   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (same escaping as `.env.example`), **or** `FIREBASE_PRIVATE_KEY_BASE64` (UTF-8 PEM → base64, one line; avoids Secret Manager newline bugs)
   - If you created a **named** Firestore database (not `(default)`), also set `FIREBASE_FIRESTORE_DATABASE_ID` to that ID (e.g. `wrrapd-firebase-db01`). Check **Firestore → database picker → Database ID** in Firebase Console.

4. Optional for proof photos: `FIREBASE_STORAGE_BUCKET` and/or `GCS_BACKUP_BUCKET` (see Proof-of-delivery section).

5. Redeploy. On Cloud Run the app **refuses to start** until these three are set (unless `TRACKING_ALLOW_EPHEMERAL=true`, which is for emergencies only).

**Collections used:** `orders` (existing), plus `tracking_drivers`, `tracking_driver_profiles`, `tracking_week_availability`, `tracking_runtime` (password override / config).

## Order ingest (Chrome extension / checkout)

`POST /api/orders/ingest` accepts JSON and creates the same `Order` records the admin UI uses (Admin / Driver / Customer apps stay in sync).

- **Auth:** `Authorization: Bearer <INGEST_API_KEY>` or `X-Ingest-Key: <INGEST_API_KEY>`. If `INGEST_API_KEY` is unset, the route returns **503**.
- **Required (after alias mapping):** `customerName`, `customerPhone`, `recipientName`, `addressLine1`, `city`, `state`, `postalCode`, `scheduledFor`.
- **Aliases:** `zipCode` -> `postalCode`; `deliveryDate` -> `scheduledFor`; `orderNumber` -> `externalOrderId` (and default `sourceNote`); nested `shippingAddress` (`line1`, `line2`, `city`, `state`, `postalCode` / `zip`, `name`) and `buyer` (`name`, `phone`).
- **400** responses include `missingFields`, `invalidFields`, and `fieldGuide` (lists fields we do **not** persist yet — e.g. ASIN, line items, AI design blobs).

## Proof-of-delivery storage

Driver proof upload still accepts multipart or JSON `dataUrl`. When Firebase/GCS is configured (`FIREBASE_STORAGE_BUCKET` or `GCS_BACKUP_BUCKET` plus service account envs), the server uploads the image and stores a **`firebasestorage.googleapis.com` URL** with a download token on the order; if upload fails, the previous behavior applies and the **data URL** is stored. `next.config.ts` allows that host for `next/image`.

## Data and Backups

Orders, drivers, profiles, and week-availability persist to **Firestore** when `FIREBASE_*` env vars are set; otherwise local `.data/` files are used (fine for dev only). Apply security rules if clients talk to Firestore directly (this app uses the **Admin SDK** on the server, which bypasses rules):

- `gcloud firestore databases create --location=us-central` (if no database yet)
- `gcloud firestore security-rules release infra/firestore.rules` (when you add client-side Firestore)

### Backup baseline

- Enable GCS object versioning:
  - `BACKUP_BUCKET=your-bucket ./scripts/configure-backups.sh`
- Schedule Firestore exports:
  - `GCP_PROJECT_ID=... BACKUP_BUCKET=... ./scripts/firestore-export.sh`
- Run monthly restore tests in non-prod.

## GitHub Checkpointing Workflow

- Commit each successful feature slice
- Tag stable milestones (`v0.1-admin`, `v0.2-driver`, `v0.3-tracking`)
- Publish release notes for each tag

## Backup Restore Drill (Monthly)

1. Create a temporary Firestore collection in dev.
2. Trigger export:
   - `GCP_PROJECT_ID=... BACKUP_BUCKET=... ./scripts/firestore-export.sh`
3. Restore into a disposable test project and verify records.
4. Validate an older object version can be retrieved from GCS proof-photo bucket.
5. Record results in release notes.
