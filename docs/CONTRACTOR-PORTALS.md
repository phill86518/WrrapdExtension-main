# Contractor portals — wrapstar.wrrapd.com & joyrider.wrrapd.com

How activated WrapStars and JoyRiders sign in after onboarding, what "Approve onboarding" migrates,
and the exact steps to point the two subdomains at the tracking app on Cloud Run.

Public names: **WrapStar** (wrapper) and **JoyRider** (courier). Code, URLs, and the WordPress CPT
still say `driver` / `courier` / `/drive/` — do not rename without a migration.

---

## 1. The lifecycle (Uber/DoorDash pattern)

| Stage | Where it happens | Credentials |
|---|---|---|
| Apply | `apply.wrrapd.com` (WrapStar) · `apply.wrrapd.com/drive/` (JoyRider) | none |
| Review → Approve for onboarding | Command Center → Applications | WordPress issues **username = email** + temporary password (email) |
| Onboarding (agreements, W-9, insurance, ID, payout) | `pros.wrrapd.com/onboarding/` · `apply.wrrapd.com/drive/driver-onboarding/` | same WordPress login |
| Profile (during onboarding) | `apply.wrrapd.com/profile/` or `pros.wrrapd.com/profile/` · `apply.wrrapd.com/drive/driver-profile/` | same login; change password here |
| **Approve onboarding** (final hire step) | Command Center → application → **Approve onboarding → active WrapStar/JoyRider** | onboarding site **closes** for them (sessions signed out) |
| Work | **`wrapstar.wrrapd.com`** (WrapStar App) · **`joyrider.wrrapd.com`** (JoyRider App) | **same email + password** as onboarding; contact details + password now edited **inside the app** |

### One login per stage — hard rules

- **Before** Approve onboarding: the portal apps refuse the login ("Almost there — finish onboarding first").
- **After** Approve onboarding: the onboarding site (`apply.` / `pros.`) refuses the login
  ("Your onboarding is complete. Sign in at wrapstar.wrrapd.com …") and any open onboarding
  sessions are destroyed. `wrrapd_wrapstars_onboarding_closed_for_user()` /
  `wrrapd_drivers_onboarding_closed_for_user()` gate every onboarding/profile page.
- **Reopen (rare):** Command Center → application (active) → **Reopen onboarding portal (rare)**.
  Sets `onboarding_reopened = 1`, emails the contractor a short note with the onboarding link; the
  contractor app keeps working. **Close onboarding portal** clears the flag and signs them out of
  the onboarding site again. Both exist on the WP admin screens too.

Singular subdomains (`wrapstar.`, `joyrider.`) are the right call — they match how a contractor
refers to themselves ("the WrapStar app"), they are shorter to type on a phone, and they mirror
`apply.` / `pros.` which are also singular.

### What "Approve onboarding" does (one click)

1. WordPress `activate`: status → `active`, role → `wrapstar_active` / `driver_active`, `activated_at`
   stamped, activation email sent with the portal URL and "sign in with the same email and password".
2. Ops roster upsert (`tracking_wrapstars` / `tracking_delivery_drivers`) with a 10-digit ID,
   delivery / printer flags, metro.
3. **Contractor record migration** → Firestore `tracking_contractor_records/{role}:{rosterId}`:
   profile (name, email, phones, mailing address), application attributes, every agreement/document
   with status + date (IC agreement, policies, orientation, background, insurance, identity, W-9,
   1099 acknowledgments), payout **summary** (method, bank name, account type, last 4, holder —
   never routing/account numbers), hire timeline (applied / interview / approved / activated), and
   onboarding-step snapshot.
4. WrapStar printer coverage re-sync (custom-design ZIP coverage).

The contractor app's **Account** tab renders that record; **Earnings** and **past orders** already
come from the ops platform (`tracking_earnings`, orders). Job history and payouts therefore appear
automatically the moment they exist — nothing else to migrate.

The Command Center button shows onboarding progress ("9 of 11 steps complete — ready to approve") and
asks for confirmation when steps are still open.

---

## 2. How login works on the portals

`POST /api/wrapstar/login` and `POST /api/courier/login` accept **email + password**:

1. The tracking app calls WordPress `POST /wp-json/wrrapd/v1/portal-auth` through the
   `api.wrrapd.com/api/wrapstars-wp-bridge` proxy with the ops key
   (`WRRAPD_WRAPSTARS_OPS_API_KEY`). WordPress checks the password and returns which roles the
   person holds (`wrapstar` / `driver`), their status, and stamps `portal_last_login_at` +
   `portal_login_count` on the application (visible in Command Center).
2. Status must be `active` and not suspended; the roster row is found by email; a session cookie is
   issued for that host only.
3. Legacy fallback: roster name / 10-digit ID + shared contractor passcode (founder + demo rows).
   Contractors with a migrated record do **not** see the shared-passcode form — their password lives in
   WordPress.

Self-service after activation (Account tab → **Edit contact details** / **Change password**):
`POST /api/contractor/contact` and `POST /api/contractor/password` (session required) call
WordPress `POST /wrrapd/v1/portal-contact` / `POST /wrrapd/v1/portal-password` (ops key, active
+ unsuspended only). Contact edits write to the WP application (source of truth) and mirror onto
the contractor record; email (the login) is changed by support only. During onboarding the same
edits live on the WP profile page → **Username & password**.

---

## 3. Do the subdomains need WordPress?

**No.** Do not install WordPress on `wrapstar.` / `joyrider.`. They point straight at the existing
Cloud Run service (`wrrapd-tracking`); the Next.js middleware rewrites the root of each host to
`/wrapstar` or `/courier`, and redirects the other app / Command Center away so one host = one
audience. WordPress stays the system of record for identity (username/password), applications,
onboarding, and the profile page.

---

## 4. EXACT steps — point the subdomains at Cloud Run

Facts as of 2026‑09‑12: DNS for `wrrapd.com` is at **SiteGround** (`ns1/ns2.siteground.net`).
`wrapstar.wrrapd.com` and `joyrider.wrrapd.com` currently resolve to SiteGround (`35.215.73.249`)
and show SiteGround's placeholder page. `track.wrrapd.com` does not resolve; the tracking app is
reachable only at `https://wrrapd-tracking-r63cgiod4q-uc.a.run.app`. No Cloud Run domain mappings
exist yet, and `wrrapd.com` is **not yet verified** for `admin@wrrapd.com` (required for mappings).

### Step A — verify wrrapd.com ownership for admin@wrrapd.com (once, ~10 min)

1. In a browser signed in as **admin@wrrapd.com** open <https://search.google.com/search-console>.
2. **Add property** → choose **Domain** → enter `wrrapd.com` → Continue.
3. Copy the TXT value it shows (`google-site-verification=…`).
4. SiteGround **Site Tools → Domain → DNS Zone Editor** (for wrrapd.com) → **Add TXT**:
   - Name/Host: leave blank (or `@`)
   - Value: the `google-site-verification=…` string
   - TTL: default
5. Back in Search Console click **Verify** (retry after a few minutes if DNS is slow).
6. On the VM confirm:

   ```bash
   gcloud domains list-user-verified --account admin@wrrapd.com --project wrrapd-chrome-extension
   ```

   `wrrapd.com` must be listed.

### Step B — remove SiteGround's records for the two subdomains

SiteGround created A records when the subdomains were added; they must go or the CNAME cannot be added.

1. Site Tools → **Domain → Subdomains** → delete `wrapstar` and `joyrider` (this only removes the
   SiteGround folder/placeholder; nothing of ours lives there).
2. Site Tools → **Domain → DNS Zone Editor** → delete any remaining **A** (and AAAA) records whose
   Name is `wrapstar` or `joyrider`.

### Step C — create the Cloud Run domain mappings (on the VM)

```bash
gcloud beta run domain-mappings create \
  --service wrrapd-tracking --domain wrapstar.wrrapd.com \
  --region us-central1 --project wrrapd-chrome-extension --account admin@wrrapd.com

gcloud beta run domain-mappings create \
  --service wrrapd-tracking --domain joyrider.wrrapd.com \
  --region us-central1 --project wrrapd-chrome-extension --account admin@wrrapd.com
```

Each command prints the DNS record to add. For a subdomain it is always:

| Type | Name | Value |
|---|---|---|
| CNAME | `wrapstar` | `ghs.googlehosted.com.` |
| CNAME | `joyrider` | `ghs.googlehosted.com.` |

### Step D — add the CNAMEs at SiteGround

Site Tools → Domain → **DNS Zone Editor** → **CNAME** tab → Add:

- Name `wrapstar` → Resolves to `ghs.googlehosted.com`
- Name `joyrider` → Resolves to `ghs.googlehosted.com`

### Step E — wait for the certificate, then verify

Google provisions the TLS certificate automatically (typically 15–60 min after DNS propagates).

```bash
gcloud beta run domain-mappings describe --domain wrapstar.wrrapd.com \
  --region us-central1 --project wrrapd-chrome-extension --account admin@wrrapd.com \
  --format='yaml(status.conditions)'

dig +short wrapstar.wrrapd.com          # → ghs.googlehosted.com. + Google IPs
curl -sI https://wrapstar.wrrapd.com/ | head -3   # → HTTP/2 200 from Cloud Run
curl -s https://wrapstar.wrrapd.com/api/tracking-build-info   # marker wrrapd-contractor-portals-…
```

`https://wrapstar.wrrapd.com/` shows the **WrapStar App Login**; `https://joyrider.wrrapd.com/` shows
the **JoyRider App Login**. `/admin` on either host redirects to the app; Command Center stays on the
run.app URL (map `track.wrrapd.com` the same way later if you want a friendly admin URL).

### Optional env overrides on Cloud Run (defaults already correct)

Use `--update-env-vars` only (never `--set-env-vars`):

- `WRAPSTAR_PORTAL_HOST=wrapstar.wrrapd.com` · `JOYRIDER_PORTAL_HOST=joyrider.wrrapd.com`

WordPress overrides (`wp-config.php`, defaults already correct): `WRRAPD_WRAPSTARS_APP_URL`
(`https://wrapstar.wrrapd.com/`), `WRRAPD_COURIER_APP_URL` (`https://joyrider.wrrapd.com`).

---

## 5. Monitoring usage

- **Command Center** → application detail → *Review actions* shows **last sign-in** and sign-in
  count for active contractors (from WordPress `portal_last_login_at` / `portal_login_count`).
- **Contractor record** (`tracking_contractor_records`) keeps `lastLoginAt` / `loginCount` per roster
  id — shown to the contractor under Account → Key dates.
- **Cloud Run** (project `wrrapd-chrome-extension` → Cloud Run → `wrrapd-tracking`):
  - *Metrics* tab: request count, latency, errors. Filter by host with a Logs query:
    `resource.type="cloud_run_revision" httpRequest.requestUrl:"wrapstar.wrrapd.com"`
  - *Logs*: `jsonPayload.message:"[activate]"` for migration errors.
- WordPress admin (apply site) → **WrapStars / Drivers** → each card's *Hire dates* table.

---

## 6. Files

| Piece | Location |
|---|---|
| WrapStar profile page | `wordpress/wrrapd-wrapstars-profile.php` (+ force-content + virtual page in `wrrapd-wrapstars.php`) |
| JoyRider profile page | `wrrapd_drivers_shortcode_profile()` in `wordpress/wrrapd-drivers.php` |
| Portal auth endpoint | `wrrapd_wrapstars_ops_portal_auth()` in `wordpress/wrrapd-wrapstars-ops-api.php` |
| Portal self-service endpoints | `wrrapd_wrapstars_ops_portal_password()` / `_portal_contact()` (same file); app side `src/lib/wp-portal-account.ts`, `src/app/api/contractor/*`, `src/components/contractor-account-settings.tsx` |
| Onboarding closure + reopen | `*_onboarding_closed_for_user()` in `wrrapd-wrapstars.php` / `wrrapd-drivers.php`; actions `reopen_onboarding` / `close_onboarding` in both ops-api files; WP admin buttons in `wrrapd-wrapstars-apply.php` / `wrrapd-drivers.php` |
| Host routing | `tracking-platform/src/middleware.ts`, `src/lib/portal-hosts.ts` |
| Login routes | `src/app/api/wrapstar/login/route.ts`, `src/app/api/courier/login/route.ts`, `src/lib/wp-portal-auth.ts` |
| Contractor record | `src/lib/contractor-records.ts`, `src/lib/sync-activated-wrapstar.ts`, `src/lib/sync-activated-driver.ts` |
| Account tab | `src/components/contractor-account-card.tsx`, used by `/wrapstar` and `/courier` |
| Approve onboarding button | `src/components/application-review-actions.tsx` |
