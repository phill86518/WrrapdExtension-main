# Current state — 2026-09-18 (evening ET)

What is **live** vs what is still open. Prefer this over older chat notes.

## Git / Cloud Run

| Item | Value |
|---|---|
| Branch | `main` (push from GCP VM → `origin`) |
| Head (move-stream) | `27aaa15` |
| Tracking image | `gcr.io/wrrapd-chrome-extension/wrrapd-tracking:27aaa15` |
| Cloud Run revision | `wrrapd-tracking-00146-g9t` (100% traffic) |
| Service URL | `https://wrrapd-tracking-r63cgiod4q-uc.a.run.app` |

## Three hire tracks (final model — live)

| | WrapStar | JoyRider | WrapRider |
|---|---|---|---|
| Apply | `apply.wrrapd.com/apply/` | `…/drive/driver-apply/` | **`…/wraprider/apply/`** ✅ |
| Landing | `apply.wrrapd.com/` | `…/drive/` | **`…/wraprider/`** ✅ |
| CPT | `wrrapd_wrapstar_app` | `wrrapd_driver_app` | `wrrapd_wraprider_app` |
| Onboarding | `pros…/onboarding/` | `pros…/driver-onboarding/` | `pros…/wraprider-onboarding/` ⏳ (see Open) |
| Command Center | `/admin/wrapstars` | `/admin/drivers` (JoyRiders) | `/admin/wrapriders` |
| App host | `wrapstar.wrrapd.com` ✅ | `joyrider.wrrapd.com` ✅ | **`wraprider.wrrapd.com`** ✅ |
| Session role | `wrapstar` | `driver` (code) | `wraprider` |
| Login | Own app only | Own app only | Own app only — **not** the other two |

Safe label pass: shopper/admin copy says **JoyRider**; code/URLs may still say `driver` / `/drive/` / `/courier`.

### Move stream (Command Center)

On a WrapRider application in **Under review** or **Interview**:

- **Move this application to WrapStar**
- **Move this application to JoyRider**

Copies relevant fields into a new app in that stream (`under_review`), marks the WrapRider post **`[Switched to …]`**, archives unused answers on the source (`switched_unused_fields` / `switched_archive`), then continues hire in the target stream like any other application.

WordPress: `wrrapd_wrapriders_move_application_to_stream()` in `wordpress/wrrapd-wrapriders-ops-api.php`  
Build marker: `WRRAPD_WRAPRIDERS_BUILD` = `2026-09-18-move-stream`

## Contractor portal DNS

| Host | Cloud Run mapping | DNS CNAME | HTTPS |
|---|---|---|---|
| `wrapstar.wrrapd.com` | Ready | `ghs.googlehosted.com` | Working |
| `joyrider.wrrapd.com` | Ready | `ghs.googlehosted.com` | Working |
| `wraprider.wrrapd.com` | Ready + **CertificateProvisioned** | `ghs.googlehosted.com` | **Working** — app at `/wraprider` |

Baby steps (historical): [WRAPRIDER-SUBDOMAIN-BABY-STEPS.md](./WRAPRIDER-SUBDOMAIN-BABY-STEPS.md).

## SiteGround MU plugins — deployed 2026-09-18

Agent deployed via temporary AI Engine plugin on `wrrapd.com` writing into SiteGround disk (plugin then deactivated).

| Install | Path on SiteGround | What landed |
|---|---|---|
| Shopper `wrrapd.com` | `…/wrrapd.com/public_html/wp-content/mu-plugins/` | orders-bridge, gift popup, auth/account CSS, mobile, seasonal, sitemap |
| Hire `apply` (+ pros when mapped) | `…/apply.wrrapd.com/public_html/wrapstars/wp-content/mu-plugins/` | wrapstars*, drivers*, **wrapriders***, boldsign |

Live checks (as of this doc):

- `https://apply.wrrapd.com/wraprider/` → `2026-09-18-move-stream`
- `https://apply.wrrapd.com/wp-json/wrrapd/v1/wraprider-applications` → 401 without ops key (route present)
- `https://wrrapd.com/` → Chrome install CTA copy present

## Windows / Chrome extension

**No pull/build required** for this workstream (tracking + WordPress MU + docs only).  
Windows pull is only when `extension/` changes.

## Still open

1. **`pros.wrrapd.com`** — still SiteGround “Under construction”. WrapStar/JoyRider/WrapRider **onboarding** URLs under `pros…` need that host pointing at the same hire WordPress as `apply` (or equivalent). Until then, approve emails that link to `pros.wrrapd.com/wraprider-onboarding/` will 404.
2. **BoldSign** — WrapRider IC template + `WRRAPD_BOLDSIGN_WRAPRIDER_IC_TEMPLATE_ID` in apply/pros `wp-config.php` (agreement step is placeholder until set).
3. Optional: real WrapRider hourly default in Command Center → Finance → Hourly rates (+ ZIP col 4).

## Not done (deferred on purpose)

- Full CPT/URL/session rename `driver` → `joyrider` (safe labels only for now).
- Separate native WrapRider mobile apps (web app on `wraprider.wrrapd.com` is the third login).

## Deploy references

- Root copy-paste order: [DEPLOYMENT.md](../DEPLOYMENT.md)
- WrapRider MU list: [wordpress/WRAPRIDERS-DEPLOY.md](../wordpress/WRAPRIDERS-DEPLOY.md)
- Contractor portals DNS: [CONTRACTOR-PORTALS.md](./CONTRACTOR-PORTALS.md)
