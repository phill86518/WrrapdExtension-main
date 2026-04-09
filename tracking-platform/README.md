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

## Data and Backups

This MVP currently uses in-memory data for speed. To move to Firestore/Cloud Storage persistence:

1. Add Firebase service account envs from `.env.example`
2. Implement persistence adapter in `src/lib/data.ts`
3. Apply security rules:
   - `gcloud firestore databases create --location=us-central`
   - `gcloud firestore security-rules release infra/firestore.rules`

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
