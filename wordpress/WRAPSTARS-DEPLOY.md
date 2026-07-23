# WrapStars Portal — deployment (apply.wrrapd.com + pros.wrrapd.com)

Dedicated WordPress install for independent gift-wrappers. **Do not install on wrrapd.com.**

---

## Architecture

| Host | Purpose |
|------|---------|
| **apply.wrrapd.com** | Landing, application form, applicant dashboard |
| **apply.wrrapd.com/driver/** | Driver hire landing + apply (see [DRIVERS-DEPLOY.md](./DRIVERS-DEPLOY.md)) |
| **pros.wrrapd.com** | Approved-only onboarding (BoldSign, insurance, quiz, PO Box, W-9) |
| **pros.wrrapd.com/driver-onboarding/** | Driver onboarding (parallel) |
| **wrrapd.com** | Consumer site — **no WrapStars MU-plugins** |

Both subdomains point to the **same document root** (one WordPress, one database). The MU-plugin routes by `HTTP_HOST`.

---

## Part 1 — SiteGround subdomain + WordPress

### 1. Create subdomains (Site Tools → Domain → Subdomains)

1. Create **`apply`** → document root: `public_html/wrapstars` (or `public_html/apply`)
2. Create **`pros`** → document root: **`public_html/wrapstars`** (same folder as apply)

Both hosts must share the **identical** path.

### 2. Install WordPress in that folder

- Use SiteGround WordPress Installer on the `wrapstars` folder
- **Site title:** Wrrapd WrapStars
- **Admin URL:** `https://apply.wrrapd.com/wp-admin/`
- Enable HTTPS for both subdomains (Let's Encrypt in Site Tools)

### 3. Install plugins (minimal)

| Plugin | Why |
|--------|-----|
| **Elementor** | Page layout |
| **Hello Elementor** theme | Lightweight |

**Do not** install User Registration, affiliate plugins, or wrrapd.com MU-plugins on this install.

### 4. WordPress settings

**Settings → General:**

- WordPress Address (URL): `https://apply.wrrapd.com`
- Site Address (URL): `https://apply.wrrapd.com`

**Settings → Permalinks:** Post name (`/%postname%/`)

---

## Part 2 — wp-config.php

Add **above** `/* That's all, stop editing! */`:

```php
/* WrapStars portal — apply + pros subdomains */
define( 'WRRAPD_WRAPSTARS_APPLY_HOST', 'apply.wrrapd.com' );
define( 'WRRAPD_WRAPSTARS_PROS_HOST', 'pros.wrrapd.com' );

/* BoldSign — create sandbox account first: https://developers.boldsign.com */
define( 'WRRAPD_BOLDSIGN_API_KEY', 'paste-api-key' );
define( 'WRRAPD_BOLDSIGN_IC_TEMPLATE_ID', 'paste-ic-template-id' );
define( 'WRRAPD_BOLDSIGN_W9_TEMPLATE_ID', 'paste-w9-template-id' );

/* Optional outbound email */
define( 'WRRAPD_WRAPSTARS_FROM_EMAIL', 'wrapstars@wrrapd.com' );
```

Never commit real API keys to Git.

---

## Part 3 — Upload MU-plugins (from monorepo)

**On SiteGround File Manager** → `wp-content/mu-plugins/`:

| Repo file | Server path |
|-----------|-------------|
| `wordpress/wrrapd-wrapstars.php` | `mu-plugins/wrrapd-wrapstars.php` |
| `wordpress/wrrapd-wrapstars-apply.php` | `mu-plugins/wrrapd-wrapstars-apply.php` |
| `wordpress/wrrapd-wrapstars-apply.js` | `mu-plugins/wrrapd-wrapstars-apply.js` |
| `wordpress/wrrapd-wrapstars-ops-api.php` | `mu-plugins/wrrapd-wrapstars-ops-api.php` |
| `wordpress/wrrapd-boldsign.php` | `mu-plugins/wrrapd-boldsign.php` |
| `wordpress/wrrapd-wrapstars.css` | `mu-plugins/wrrapd-wrapstars.css` |

**SSH copy-paste** (adjust `WP_ROOT`):

```bash
export REPO_ROOT=/home/phill/wrrapd-GCP
export WP_ROOT=/home/USER/public_html/wrapstars

mkdir -p "$WP_ROOT/wp-content/mu-plugins"
install -m 0644 "$REPO_ROOT/wordpress/wrrapd-wrapstars.php" "$WP_ROOT/wp-content/mu-plugins/"
install -m 0644 "$REPO_ROOT/wordpress/wrrapd-wrapstars-apply.php" "$WP_ROOT/wp-content/mu-plugins/"
install -m 0644 "$REPO_ROOT/wordpress/wrrapd-wrapstars-apply.js" "$WP_ROOT/wp-content/mu-plugins/"
install -m 0644 "$REPO_ROOT/wordpress/wrrapd-wrapstars-ops-api.php" "$WP_ROOT/wp-content/mu-plugins/"
install -m 0644 "$REPO_ROOT/wordpress/wrrapd-boldsign.php" "$WP_ROOT/wp-content/mu-plugins/"
install -m 0644 "$REPO_ROOT/wordpress/wrrapd-wrapstars.css" "$WP_ROOT/wp-content/mu-plugins/"
```

### Command Center Applications (ops API)

In **apply/pros `wp-config.php`** (above “stop editing”):

```php
define( 'WRRAPD_WRAPSTARS_OPS_API_KEY', 'generate-a-long-random-secret' );
```

On **tracking Cloud Run**, set the same secret:

- `WRRAPD_WRAPSTARS_OPS_API_KEY` = same value
- `WRRAPD_WRAPSTARS_WP_BASE_URL` = `https://apply.wrrapd.com` (optional; this is the default)

Then open Command Center → **Applications** to interview / approve / reject / activate. Do not use WP Admin for day-to-day hiring.

### Verify MU-plugin loaded

View source on `https://apply.wrrapd.com/apply/` — should include `wrrapd-wrapstars` CSS and portal header.

---

## Part 4 — BoldSign setup

1. Create [BoldSign developer sandbox](https://developers.boldsign.com/api-overview/developer-sandbox-account/)
2. Upload IC Agreement PDF from `docs/wordpress-snippets/wrrapd-wrapstar-ic-agreement.md` (convert to PDF with text tags)
3. Upload IRS W-9 template with signature fields
4. Copy **template IDs** into `wp-config.php`
5. **Webhook:** BoldSign dashboard → Webhooks → add:
   ```
   https://pros.wrrapd.com/wp-json/wrrapd/v1/boldsign-webhook
   ```
6. Test embedded signing on `/onboarding/agreement/` with a sandbox-approved applicant

---

## Part 5 — Create Elementor pages

See **[../docs/wordpress-snippets/wrrapd-wrapstars-elementor-pages.md](../docs/wordpress-snippets/wrrapd-wrapstars-elementor-pages.md)**.

### apply.wrrapd.com

| Page | Slug | Shortcode |
|------|------|-----------|
| Home | `/` | `[wrrapd_wrapstar_landing]` |
| Apply | `apply` | `[wrrapd_wrapstar_apply]` |
| Dashboard | `dashboard` | `[wrrapd_wrapstar_status]` |
| WrapStar login | `wrapstar-login` | `[wrrapd_wrapstar_login]` |
| Decline offer | `decline-offer` | `[wrrapd_wrapstar_decline]` |

Set **Settings → Reading → Homepage** to the landing page.

### pros.wrrapd.com

Create the same pages (same WP database) — URLs work on both hosts; host routing redirects cross-traffic:

| Page | Slug | Shortcode |
|------|------|-----------|
| Onboarding hub | `onboarding` | `[wrrapd_wrapstar_onboarding step="welcome"]` |
| Agreement | `onboarding/agreement` | `[wrrapd_wrapstar_onboarding step="agreement"]` |
| Policies | `onboarding/policies` | `[wrrapd_wrapstar_onboarding step="policies"]` |
| Orientation | `onboarding/orientation` | `[wrrapd_wrapstar_onboarding step="orientation"]` |
| Background | `onboarding/background` | `[wrrapd_wrapstar_onboarding step="background"]` |
| Insurance | `onboarding/insurance` | `[wrrapd_wrapstar_onboarding step="insurance"]` |
| Identity | `onboarding/identity` | `[wrrapd_wrapstar_onboarding step="identity"]` |
| PO Box | `onboarding/po-box` | `[wrrapd_wrapstar_onboarding step="po_box"]` |
| W-9 | `onboarding/w-9` | `[wrrapd_wrapstar_onboarding step="w9"]` |
| Tax 1099 | `onboarding/tax-1099` | `[wrrapd_wrapstar_onboarding step="tax_1099"]` |
| Bank / payout | `onboarding/bank-payout` | `[wrrapd_wrapstar_onboarding step="bank_payout"]` |
| Activation | `onboarding/activation` | `[wrrapd_wrapstar_onboarding step="activation"]` |

Full portal map + document handoff list: **[../docs/WRAPSTAR-ONBOARDING-PORTAL.md](../docs/WRAPSTAR-ONBOARDING-PORTAL.md)**.

Use **parent page** `onboarding` for child slugs in WordPress (Pages → Attributes → Parent).

---

## Part 6 — Admin workflow

1. **WP Admin → WrapStars** (left menu)
2. Review pending applications (ID download link)
3. **Approve** → email sent with `pros.wrrapd.com/onboarding/` link
4. After applicant completes all steps → **Activate Wrap Star**
5. **Suspend** active Wrap Stars for policy violations

---

## Part 7 — Cache & SSL

1. **WP Admin → Performance → Purge All Caches** (if caching plugin installed)
2. Confirm both URLs load:
   - `https://apply.wrrapd.com/apply/`
   - `https://pros.wrrapd.com/onboarding/`
3. Confirm `wrrapd.com` does **not** load WrapStars header (MU-plugin inactive there)

---

## Part 8 — GitHub / VM push

After edits on the GCP VM:

```bash
cd /home/phill/wrrapd-GCP
git status
git add wordpress/wrrapd-wrapstars.php wordpress/wrrapd-boldsign.php wordpress/wrrapd-wrapstars.css wordpress/WRAPSTARS-DEPLOY.md docs/wordpress-snippets/wrrapd-wrapstars-*
git commit -m "Add WrapStars portal MU-plugins for apply and pros subdomains"
git push origin main
```

Then upload changed files to SiteGround (Part 3). **No PM2 or Cloud Run restart** required — WordPress-only.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Plugin not active on apply/pros | Confirm files in `mu-plugins/`; check `HTTP_HOST` matches wp-config hosts |
| BoldSign iframe blank | Verify API key + template IDs; check applicant email matches WP login |
| Onboarding redirects to dashboard | Applicant not approved — approve in WP Admin → WrapStars |
| `/onboarding` on apply host | Should redirect to pros — clear cache |
| Upload fails | Check `wp-content/wrapstars-private/` is writable |

---

## Security notes

- Applicant files stored in `wp-content/wrapstars-private/` (`.htaccess` deny all)
- BoldSign API key server-side only
- Background checks **not** implemented (insurance + video + contract mitigation instead)
