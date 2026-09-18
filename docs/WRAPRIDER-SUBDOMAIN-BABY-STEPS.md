# WrapRider subdomain — baby steps (do this once)

**Goal:** make `https://wraprider.wrrapd.com` open the WrapRider App (same Cloud Run service that already powers wrapstar + joyrider).

**Good news:** `wrapstar.wrrapd.com` and `joyrider.wrrapd.com` are **already working**. You only need to add **wraprider**.

**Where you work:**
- Your **laptop browser** (SiteGround + Google)
- The **GCP VM** (`ssh admin_@wrrapd-server-1` or your usual Cursor remote)

---

## Before you start (30-second check)

On the VM, run:

```bash
dig +short wraprider.wrrapd.com
gcloud beta run domain-mappings list --region us-central1 --project wrrapd-chrome-extension
```

- If `wraprider.wrrapd.com` is already listed and `dig` shows `ghs.googlehosted.com` → you’re done; open https://wraprider.wrrapd.com/ and stop.
- If not → continue below.

---

## Step 1 — Open SiteGround DNS (laptop)

1. Go to [SiteGround Site Tools](https://my.siteground.com/) and log in.
2. Open the site for **wrrapd.com**.
3. Left menu: **Domain** → **DNS Zone Editor**.
4. You should see tabs like **A**, **CNAME**, **TXT**. Stay here for Steps 2–4.

---

## Step 2 — Clean up any old wraprider record (laptop)

We need a free name `wraprider` so we can add a CNAME.

1. In **DNS Zone Editor**, open the **A** tab.
2. Look for a row whose **Name** is `wraprider` (or `wraprider.wrrapd.com`).
3. If you find one → click **Delete** / trash. Confirm.
4. Open the **AAAA** tab and delete any `wraprider` row there too (if any).
5. Optional: **Domain → Subdomains**. If SiteGround lists a subdomain named `wraprider`, delete it. That only removes SiteGround’s empty folder — it does **not** delete our app.

If there is no wraprider row anywhere, that’s fine — go to Step 3.

---

## Step 3 — Ask Google to accept wraprider.wrrapd.com (on the VM)

1. SSH to the VM (or use your Cursor terminal already on the VM).
2. Paste this **exact** command and press Enter:

```bash
gcloud beta run domain-mappings create \
  --service wrrapd-tracking \
  --domain wraprider.wrrapd.com \
  --region us-central1 \
  --project wrrapd-chrome-extension \
  --account admin@wrrapd.com
```

3. What you should see:
   - Success text, **or**
   - “already exists” → that’s OK; continue.
4. If Google says the domain is **not verified**, do the one-time verification in the appendix at the bottom, then re-run this Step 3 command.

5. Confirm it exists:

```bash
gcloud beta run domain-mappings list --region us-central1 --project wrrapd-chrome-extension
```

You want a row for `wraprider.wrrapd.com`.

---

## Step 4 — Point DNS at Google (laptop — SiteGround)

1. Back in SiteGround → **Domain → DNS Zone Editor → CNAME** tab.
2. Click **Add** / **Create**.
3. Fill in **exactly**:

| Field | What to type |
|---|---|
| Name / Host | `wraprider` |
| Points to / Resolves to / Value | `ghs.googlehosted.com` |
| TTL | leave default |

4. Save.

**Do not** add an A record for wraprider. CNAME only.

---

## Step 5 — Wait for DNS + HTTPS certificate

1. Wait **5–15 minutes** (sometimes up to an hour).
2. On the VM, check DNS:

```bash
dig +short wraprider.wrrapd.com
```

You want something like:

```text
ghs.googlehosted.com.
172.x.x.x
```

(Google IP numbers vary — that’s fine.)

3. Check the mapping status:

```bash
gcloud beta run domain-mappings describe --domain wraprider.wrrapd.com \
  --region us-central1 --project wrrapd-chrome-extension --account admin@wrrapd.com \
  --format='yaml(status.conditions)'
```

Look for conditions that say `status: True` (CertificateProvisioned / Ready). If still False, wait and re-check.

---

## Step 6 — Prove it works (laptop browser)

1. Open a **private/incognito** window.
2. Go to: https://wraprider.wrrapd.com/
3. You should see the **WrapRider App Login** (not SiteGround’s placeholder, not WrapStar, not JoyRider).
4. Bonus check from the VM:

```bash
curl -sI https://wraprider.wrrapd.com/ | head -5
```

Expect `HTTP/2 200` and a Next.js-ish response (same family as wrapstar/joyrider).

---

## Step 7 — WordPress (only if you want activation emails to say wraprider)

On the **apply/pros** WordPress `wp-config.php`, you may add (optional — code already defaults to this URL):

```php
define( 'WRRAPD_WRAPRIDER_APP_URL', 'https://wraprider.wrrapd.com' );
```

No Cloud Run env change is required for the default host name.

---

## You’re done when…

| Check | Passes when |
|---|---|
| `dig +short wraprider.wrrapd.com` | shows `ghs.googlehosted.com` |
| Mapping list | includes `wraprider.wrrapd.com` |
| Browser | https://wraprider.wrrapd.com/ shows WrapRider login |

---

## Appendix — if Google says “domain not verified”

Do this **once** (you may already have done it for wrapstar/joyrider):

1. Browser: sign in as **admin@wrrapd.com**.
2. Open https://search.google.com/search-console → **Add property** → **Domain** → `wrrapd.com`.
3. Copy the `google-site-verification=…` TXT value.
4. SiteGround → DNS Zone Editor → **TXT** → Add:
   - Name: `@` (or blank)
   - Value: the verification string
5. Back in Search Console → **Verify**.
6. On the VM:

```bash
gcloud domains list-user-verified --account admin@wrrapd.com --project wrrapd-chrome-extension
```

`wrrapd.com` must appear. Then redo **Step 3**.

---

## Troubleshooting (plain English)

| Symptom | Fix |
|---|---|
| SiteGround placeholder page | CNAME missing or still an old A record for `wraprider` — redo Steps 2 and 4 |
| Browser “certificate error” | Wait longer for Google’s free HTTPS cert (Step 5) |
| Opens WrapStar instead of WrapRider | Wrong hostname typed; must be **wraprider**.wrrapd.com |
| `gcloud` says permission denied | Use `--account admin@wrrapd.com` and project `wrrapd-chrome-extension` exactly as written |
