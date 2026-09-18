# Current state — 2026-09-18 (UTC) / 2026-09-17 evening ET

Snapshot of what is shipped vs what still needs human action on SiteGround / DNS.

## Git / Cloud Run

| Item | Value |
|---|---|
| Branch | `main` (push from GCP VM → `origin`) |
| Tracking image live | `gcr.io/wrrapd-chrome-extension/wrrapd-tracking:2445d02` |
| Cloud Run revision | `wrrapd-tracking-00145-f7l` (100% traffic) |
| Service URL | `https://wrrapd-tracking-r63cgiod4q-uc.a.run.app` |

## Three hire tracks (final model)

| | WrapStar | JoyRider | WrapRider |
|---|---|---|---|
| Apply | `apply.wrrapd.com` | `…/drive/` | `…/wraprider/apply/` |
| CPT | `wrrapd_wrapstar_app` | `wrrapd_driver_app` | `wrrapd_wraprider_app` |
| Onboarding | `/onboarding/` | `/driver-onboarding/` | `/wraprider-onboarding/` |
| Command Center | `/admin/wrapstars` | `/admin/drivers` (label: JoyRiders) | `/admin/wrapriders` |
| App host | `wrapstar.wrrapd.com` ✅ | `joyrider.wrrapd.com` ✅ | `wraprider.wrrapd.com` ⏳ cert |
| Session role | `wrapstar` | `driver` (code) | `wraprider` |
| Login | Own app only | Own app only | Own app only — **not** the other two |

Safe label pass: shopper/admin copy says **JoyRider**; code/URLs may still say `driver` / `/drive/` / `/courier`.

## Contractor portal DNS

| Host | Cloud Run mapping | DNS CNAME | HTTPS |
|---|---|---|---|
| `wrapstar.wrrapd.com` | Ready | `ghs.googlehosted.com` | Working |
| `joyrider.wrrapd.com` | Ready | `ghs.googlehosted.com` | Working |
| `wraprider.wrrapd.com` | **Created 2026-09-18** — CertificatePending | Already `ghs.googlehosted.com` | Wait for Google cert (often 15–60 min). `ERR_CONNECTION_CLOSED` until Ready. |

Baby steps (historical): [WRAPRIDER-SUBDOMAIN-BABY-STEPS.md](./WRAPRIDER-SUBDOMAIN-BABY-STEPS.md).  
Mapping create is done on the VM; wait for certificate, then open https://wraprider.wrrapd.com/

Check cert:

```bash
gcloud beta run domain-mappings describe --domain wraprider.wrrapd.com \
  --region us-central1 --project wrrapd-chrome-extension \
  --format='yaml(status.conditions)'
```

Want `CertificateProvisioned` / `Ready` = `True`.

## Shopper site (wrrapd.com) — MU deploy still needed on SiteGround

These are in git; **upload to SiteGround `mu-plugins/` + purge W3** if not already:

| File | Why |
|---|---|
| `wordpress/wrrapd-orders-bridge.php` | CTA restore (`2026-09-17-cta-restore`); logo gold |
| `wordpress/wrrapd-gift-wrap-popup.js` | Popup letter animation fix |
| `wordpress/wrrapd-drivers.php` (+ apply/ops/css/js) | JoyRider labels |
| `wordpress/wrrapd-wrapriders*.php` (+ apply js/css/ops) | Third hire track portal |
| `wordpress/wrrapd-wrapstars-ops-api.php` | Strict portal-auth per track |
| `wordpress/wrrapd-account-critical.css` / `wrrapd-auth-critical.css` | Logo-gold auth/account |
| `wordpress/wrrapd-sitemap-status.php` (+ public sitemap xml if used) | Clean sitemap / SEO helpers |

Confirm CTAs: view-source contains `2026-09-17-cta-restore`. Private window if extension is installed (CTAs hide only after live ping).

## Windows / Chrome extension

**No pull/build required** for this workstream (tracking + WordPress MU + docs only).  
Windows pull is only when `extension/` changes.

## Still open (human)

1. **Wait** for `wraprider.wrrapd.com` TLS → then verify WrapRider login page.
2. **Upload** pending MU plugins to SiteGround apply/pros + wrrapd.com as listed above; purge W3.
3. Optional: BoldSign WrapRider IC template + `WRRAPD_BOLDSIGN_WRAPRIDER_IC_TEMPLATE_ID` in apply/pros `wp-config.php`.
4. Optional: set real WrapRider hourly default in Command Center → Finance → Hourly rates.

## Not done (deferred)

- Full CPT/URL/session rename `driver` → `joyrider` (safe labels only for now).
- Separate native WrapRider mobile apps (web app on wraprider host is the third login).
