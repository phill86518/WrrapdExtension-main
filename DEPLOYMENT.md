# Wrrapd — copy-paste deployment

Use this file for **exact** commands. Order matters.

## Rules (read once)

1. **GCP VM:** Ship changes with **`git push`** to GitHub. Do **not** run **`git pull`** on the production VM unless you deliberately want to merge `origin` onto local work (see repo `.cursor/rules/gcp-vm-no-git-pull.mdc`).
2. **Windows (Roger):** The Chrome extension is built from the **GitHub clone on Windows**, not from `wrrapd-GCP` on the VM path.
3. **Restart `wrrapd-server` (PM2)** only when **`backend/wrrapd-api-repo/WrrapdServer`** (or its deps) changed.
4. **Cloud Run (`wrrapd-tracking`)** only when **`tracking-platform/`** changed.
5. **Extension:** Windows `npm run build` + Chrome Reload when **`extension/`** changed (no PM2).

---

## 1) SSH to the GCP VM

```bash
ssh admin_@wrrapd-server-1
```

(Use your real SSH target if different.)

---

## 2) On the VM — push code to GitHub

```bash
cd /home/phill/wrrapd-GCP
git status
git add -A
git commit -m "Describe your change."
git push origin main
```

Skip `git add` / `git commit` if there is nothing to commit. If the VM has **no** local edits and you only need to deploy what is already on `origin`, you still **do not** need `git pull` before deploy unless you are intentionally syncing the VM to GitHub first.

---

## 3) On the VM — API server (`wrrapd-server`) — **only if backend changed**

Run when **`backend/wrrapd-api-repo/WrrapdServer/`** (or dependencies you install there) changed.

```bash
cd /home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer
npm install
pm2 restart wrrapd-server
curl -sS http://127.0.0.1:8080/health
```

Optional logs:

```bash
pm2 logs wrrapd-server --lines 80
```

**Skip this entire section** for extension-only or tracking-only releases.

---

## 4) On the VM — tracking app (Cloud Run) — **only if `tracking-platform/` changed**

From the **monorepo root** (directory that contains `tracking-platform/`):

```bash
cd /home/phill/wrrapd-GCP

gcloud config set project wrrapd-chrome-extension

PROJECT_ID=wrrapd-chrome-extension
TAG=$(git rev-parse --short HEAD)
IMAGE="gcr.io/${PROJECT_ID}/wrrapd-tracking:${TAG}"

gcloud builds submit tracking-platform --tag "$IMAGE" --project "$PROJECT_ID"

gcloud run deploy wrrapd-tracking \
  --image "$IMAGE" \
  --region us-central1 \
  --project "$PROJECT_ID" \
  --allow-unauthenticated
```

**Do not** use `gcloud run deploy ... --set-env-vars ...` for routine deploys: that flag **replaces the entire** environment variable set on the service. Prefer **image-only** deploy (above). To change one or two vars, use **`--update-env-vars`** or the Cloud Run console.

Optional (print service URL):

```bash
gcloud run services describe wrrapd-tracking \
  --region us-central1 \
  --project wrrapd-chrome-extension \
  --format='value(status.url)'
```

**Skip this entire section** if you did not change `tracking-platform/`.

---

## 5) On Windows — Chrome extension — **only if `extension/` changed**

Authoritative clone (example paths):

- **Explorer:** `C:\Roger_Documents\Wrap-O-Matic\WRRAPD\CHROME EXTENSION\WrrapdExtension-main (main)`
- **Git Bash:** `/c/Roger_Documents/Wrap-O-Matic/WRRAPD/CHROME EXTENSION/WrrapdExtension-main (main)`

From the **repo root** of that clone:

```bash
git restore extension/content.js
git pull origin main
cd extension
npm install
npm run build
cd ..
```

Then **Chrome → Extensions → Wrrapd → Reload**.

`git restore extension/content.js` removes a dirty/generated `content.js` so `git pull` is not blocked.

**Skip this section** if you did not change the extension.

---

## Quick “what do I run?”

| What changed | VM: step 2 push | VM: step 3 PM2 | VM: step 4 Cloud Run | Windows: step 5 build |
|----------------|----------------|----------------|------------------------|------------------------|
| `extension/` only | If you committed on VM | No | No | Yes |
| `backend/wrrapd-api-repo/WrrapdServer/` | Yes | Yes | No | No |
| `tracking-platform/` | Yes | No | Yes | No |
| More than one of the above | Yes | If backend touched | If tracking touched | If extension touched |

---

## Related docs

- Monorepo overview: [README.md](README.md)
- Customer accounts + order history (spec): [docs/CUSTOMER-ACCOUNTS-AND-ORDER-HISTORY.md](docs/CUSTOMER-ACCOUNTS-AND-ORDER-HISTORY.md)
- Integration map (extension / API / tracking / WordPress): [docs/INTEGRATION-MAP.md](docs/INTEGRATION-MAP.md)
- WordPress site edits log (Elementor, global CSS): [docs/WORDPRESS-SITE-EDITS-LOG.md](docs/WORDPRESS-SITE-EDITS-LOG.md)
- GCP IAM: `wrrapd-logins` vs `wrrapd-chrome-extension`: [docs/GCP-WRRAPD-LOGINS-ACCESS.md](docs/GCP-WRRAPD-LOGINS-ACCESS.md)
- Extension build and paths: [extension/README.md](extension/README.md)
- PM2 details: [backend/wrrapd-api-repo/WrrapdServer/README-PM2.md](backend/wrrapd-api-repo/WrrapdServer/README-PM2.md)
- Tracking app + Cloud Run notes: [tracking-platform/README.md](tracking-platform/README.md)
- Cursor rule (same sequence): [.cursor/rules/wrrapd-deploy-sequence.mdc](.cursor/rules/wrrapd-deploy-sequence.mdc)
