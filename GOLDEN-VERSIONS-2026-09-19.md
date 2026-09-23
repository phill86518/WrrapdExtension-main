# Wrrapd Latest Golden versions — 2026-09-19

Recorded on **Saturday, 19 September 2026** on the GCP VM (`/home/phill/wrrapd-GCP`), then pushed to `origin/main`.

These three names are the restore vocabulary:

| Spoken name | Git tag | Status |
|---|---|---|
| **EXTENSION LATEST GOLDEN VERSION** | `golden-extension-2026-09-19` | Loved and working |
| **WEBSITE LATEST GOLDEN VERSION** | `golden-website-2026-09-19` | Loved — current wrrapd.com |
| **ADMIN LATEST GOLDEN VERSION** | `golden-admin-2026-09-19` | Happy with it; **not fully tested yet** |
| All three together | `golden-latest-2026-09-19` | Same commit |

**Extension product version:** `3.0.10`  
**Website MU build string (view-source):** `2026-09-18-orders-reminder-row`  
**Code freeze:** `b9bc9f2` *Bump extension to 3.0.10 and keep retailer gift choices through checkout.* plus this documentation commit.

Older homepage-only snapshot (do not use unless asked): `golden-homepage-2026-09-08`.

---

## 1. EXTENSION LATEST GOLDEN VERSION

Chrome extension **3.0.10**. Shopper-loved Amazon checkout + pay; other retailers use the shared session pay flow (blank checkout scrapes no longer wipe gift choices).

### Identity

| Setting | Value |
|---|---|
| `manifest.json` version | **3.0.10** |
| Site update nudge (`$latest_version`) | **3.0.10** |
| Chrome Web Store / detect ID | `kdfcahdcgpaoohpgagpmpbgcmkdbocbg` (live listing, Sep 2026) |
| Build | `cd extension && npm run build` → committed `content*.js` bundles |

### Retailers (content scripts)

| Host | Bundle |
|---|---|
| amazon.com | `content.js` ← `src/content/index.js` + `content-legacy.js` |
| target.com | `content-target.js` |
| lego.com | `content-lego.js` |
| ulta.com | `content-ulta.js` |
| walmart.com | `content-walmart.js` |
| nordstrom.com | `content-nordstrom.js` |
| kohls.com | `content-kohls.js` |
| sephora.com | `content-sephora.js` |
| bestbuy.com | `content-bestbuy.js` |
| etsy.com | `content-etsy.js` |

### Canonical source (do not regress)

- Shared pay: `extension/src/shared/retailer-checkout-pay-flow.js`, `cart-gift-sync.js`, `cart-gift-session.js`
- Amazon pay / hub: `extension/src/content/content-legacy.js`
- LEGO pay: `extension/src/retailers/lego/lego-checkout-pay-flow.js`, `lego-cart-extract.js`
- Manifest + DNR: `extension/manifest.json`, `extension/rules.json`

### Windows refresh (Roger)

```bash
git restore extension/
git pull origin main
cd extension
npm install
npm run build
cd ..
```

Chrome → Extensions → Wrrapd → **Reload**. Confirm version **3.0.10**. No `wrrapd-server` restart for extension-only.

---

## 2. WEBSITE LATEST GOLDEN VERSION (wrrapd.com)

Shopper site the owner is happy with. Theme **Hello Elementor** (`hello-elementor`). Front page **ID 4857** (`01-wrrapd-homepage`). Permalinks `/%postname%/`. Tagline **Wrapping Happiness!**. Site URL `https://wrrapd.com`.

Live disk is **SiteGround** `mu-plugins/` (not auto-synced from Git). Confirm view-source contains `2026-09-18-orders-reminder-row`.

### Live shopper / account URLs (in use)

| URL | Page ID | Role |
|---|---|---|
| https://wrrapd.com/ | 4857 | Homepage (hero, retailer wheels, ticker, featured gifts, header/footer) |
| https://wrrapd.com/about-us/ | 4548 | About |
| https://wrrapd.com/contact/ | 131 | Contact |
| https://wrrapd.com/top-gifting-choices/ | 6936 | Gift hubs / seasonal picks |
| https://wrrapd.com/privacy/ | 6772 | Privacy |
| https://wrrapd.com/terms/ | 5209 | Terms of Use |
| https://wrrapd.com/affiliate-disclosure/ | 6930 | Affiliate disclosure |
| https://wrrapd.com/sms-consent/ | 6202 | SMS consent |
| https://wrrapd.com/ecomms-policy/ | 6889 | Electronic communications |
| https://wrrapd.com/login/ | 5280 | Login |
| https://wrrapd.com/register/ | 5281 | Register |
| https://wrrapd.com/logout/ | 5283 | Logout |
| https://wrrapd.com/password-reset/ | 5285 | Password reset |
| https://wrrapd.com/account/ | 5284 | Account (alias) |
| https://wrrapd.com/my-account-2/ | 4621 | My Account (canonical) |
| https://wrrapd.com/my-orders/ | 6276 | Order History |
| https://wrrapd.com/members/ | 5282 | Members |
| https://wrrapd.com/welcome/ | 5576 | User welcome |
| https://wrrapd.com/06-email_verification/ | 5234 | Email verification |
| https://wrrapd.com/decline-offer/ | 7217 | Declined offer |

Public sitemap (`wordpress/wrrapd-public-sitemap.xml`): `/`, `/about-us/`, `/contact/`, `/top-gifting-choices/`, `/privacy/`, `/terms/`, `/affiliate-disclosure/`, `/sms-consent/`, `/ecomms-policy/`.

### Header / chrome (must not regress)

Same rules as the 2026-09-08 homepage golden, still true on this site:

- Brand/logo **left**. Desktop Chrome CTA one line, true page center; hidden on mobile/coarse.
- Auth column fixed right (~12.5rem). Register/Login above Google/Amazon.
- Logo gold **`#f6b933`**, navy **`#0f0351`**. Do not use neon yellow or plugin-default blue on shopper buttons.
- “Delivering to…” uses Fraunces.
- No white strip between retailer logos and the “Next gifting occasion” ticker.

### Order History (this golden)

- Month + day compact; **Set annual reminder** + days-prior on the **same row**.
- No “Sales tax included in total where applicable.” line.
- Fraunces on headings / summary; circular retailer logos.

### Repo files that define the shopper site

Copy these to SiteGround `wp-content/mu-plugins/` (and `logos/`) when restoring:

- `wordpress/wrrapd-orders-bridge.php` — header, auth CTA, orders, extension detect
- `wordpress/wrrapd-mobile-responsive.css`
- `wordpress/wrrapd-account-critical.css`
- `wordpress/wrrapd-auth-critical.css`
- `wordpress/wrrapd-seasonal-campaigns.php`
- `wordpress/wrrapd-seasonal-campaigns.css`
- `wordpress/wrrapd-campaigns.json`
- `wordpress/wrrapd-gift-wrap-popup.php` + `.css` + `.js`
- `wordpress/wrrapd-sitemap-status.php`
- `wordpress/wrrapd-public-sitemap.xml`
- `wordpress/logos/*`

### Hire / contractor hosts (same WordPress repo, **not** wrrapd.com chrome)

These keep their own CSS. Do not restyle them with shopper gold rules.

| Host | Role | MU / files |
|---|---|---|
| apply.wrrapd.com | Apply (WrapStar / JoyRider / WrapRider) | `wrrapd-wrapstars*.php/js/css`, `wrrapd-drivers*.php/js/css`, `wrrapd-wrapriders*.php/js/css` |
| pros.wrrapd.com | Onboarding | same + `wrrapd-boldsign.php`, `wrrapd-wrapstars-profile.php` |
| wrapstar.wrrapd.com / joyrider.wrrapd.com | Post-activate apps | portal redirects after Command Center Activate |

### WordPress settings snapshot (live, 2026-09-19)

| Setting | Value |
|---|---|
| `siteurl` | `https://wrrapd.com` |
| `show_on_front` | `page` |
| `page_on_front` | `4857` |
| `stylesheet` / theme | `hello-elementor` |
| `permalink_structure` | `/%postname%/` |
| `blogdescription` | Wrapping Happiness! |
| Cache | W3 Total Cache **2.10.6** (active) — purge after MU deploy |
| Page builder | Elementor **4.2.4** + Elementor Pro **3.9.2** |
| Members | Ultimate Member **2.12.1**; Nextend Social Login **3.1.26** |
| Commerce plugin | WooCommerce **11.1.1** (shop pages marked NOT IN USE) |
| Mail | WP Mail SMTP **4.9.0** |
| Chat | Tidio **8.0.0** |
| SEO / analytics | Site Kit **1.187.0**; Independent Analytics **2.15.5** |
| Custom plugin | Wrrapd Member Header **2.1.0** (active) |
| Custom plugin | Wrrapd Sitemap HTTP 200 **1.2.0** (active) |

Unused / backup WP pages (do not resurrect): titles containing `NOT IN USE`, old shop/cart/wishlist/vendor, extra home variants.

### Related shopper hosts (not WordPress)

| Host | Role |
|---|---|
| pay.wrrapd.com | Stripe / Wrrapd checkout popup |
| api.wrrapd.com | Pay server (`wrrapd-server` on VM) |

---

## 3. ADMIN LATEST GOLDEN VERSION (Command Center)

Tracking / ops app. Owner is happy with the current UI; **full admin testing is still pending** — treat as golden for layout and routes, not as a proven ops runbook.

### Deploy identity

| Setting | Value |
|---|---|
| GCP project | **`wrrapd-chrome-extension`** (never `wrrapd-logins`) |
| Cloud Run service | `wrrapd-tracking` |
| Region | `us-central1` |
| Image | `gcr.io/wrrapd-chrome-extension/wrrapd-tracking:<git-short-sha>` |
| Image-only deploy | no `--set-env-vars` (wipes service env) |

### Routes

| Path | Role |
|---|---|
| `/` | Ops hub |
| `/admin` | **Command Center** login + home |
| `/admin/orders` | Orders list |
| `/admin/orders/[id]` | Order detail |
| `/admin/orders/calendar` | Calendar |
| `/admin/allocations` | Allocations |
| `/admin/applications` + `/admin/applications/[id]` | Hire applications |
| `/admin/drivers` + `/admin/drivers/[id]` | JoyRiders |
| `/admin/wrapstars` + `/admin/wrapstars/[id]` | WrapStars |
| `/admin/wrapriders` + `/admin/wrapriders/[id]` | WrapRiders |
| `/admin/finance` + `/admin/finance/rates` | Finance |
| `/admin/pricing` | Pricing |
| `/admin/reports` | Reports |
| `/admin/zip-codes` | ZIP coverage |
| `/admin/printer-coverage` | Printer coverage |
| `/driver` | Driver companion |
| `/wrapstar` | WrapStar companion |
| `/wraprider` | WrapRider companion |
| `/courier` | Courier |
| `/track/[token]` | Customer tracking |
| `/delivery-choice` | Delivery choice |
| `/platform` | Redirects to `/` |

Canonical sources: `tracking-platform/src/app/admin/**`, `tracking-platform/README.md`. Mobile shells: `tracking-platform/mobile/admin`, `mobile/driver`.

### Restore / deploy Command Center

Only if `tracking-platform/` was reverted or you are shipping a new image:

```bash
cd /home/phill/wrrapd-GCP
gcloud config set project wrrapd-chrome-extension
PROJECT_ID=wrrapd-chrome-extension
TAG=$(git rev-parse --short HEAD)
IMAGE="gcr.io/${PROJECT_ID}/wrrapd-tracking:${TAG}"
gcloud builds submit tracking-platform --tag "$IMAGE" --project "$PROJECT_ID"
gcloud run deploy wrrapd-tracking --image "$IMAGE" --region us-central1 --project "$PROJECT_ID" --allow-unauthenticated
```

Do **not** `git pull` on this VM.

---

## Restore recipes

```bash
cd /home/phill/wrrapd-GCP
git fetch origin --tags

# Extension 3.0.10
git checkout golden-extension-2026-09-19 -- extension/

# Website MU + this doc
git checkout golden-website-2026-09-19 -- wordpress/ \
  .cursor/rules/wrrapd-latest-golden-versions.mdc \
  GOLDEN-VERSIONS-2026-09-19.md

# Command Center
git checkout golden-admin-2026-09-19 -- tracking-platform/
```

After website files: copy MU plugins to SiteGround `mu-plugins/` and **purge W3 cache**.  
After extension: Windows pull + `npm run build` + Chrome Reload.  
After admin: Cloud Run image deploy only if tracking code changed.
