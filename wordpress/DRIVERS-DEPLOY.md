# Drivers Portal — deployment (Option 2 on apply + pros)

Courier Driver hire pipeline parallel to WrapStars. **Same WordPress install** as WrapStars (`apply.wrrapd.com` + `pros.wrrapd.com`). Do not install on consumer `wrrapd.com`.

---

## Architecture

| Host / path | Purpose |
|-------------|---------|
| **apply.wrrapd.com/driver/** | Driver landing (Flex-inspired) |
| **apply.wrrapd.com/driver/driver-apply/** | Application form |
| **apply.wrrapd.com/driver/driver-thank-you/** | Post-submit |
| **apply.wrrapd.com/driver-login/** | Approved Driver portal login |
| **apply.wrrapd.com/driver-decline/** | Decline invitation |
| **pros.wrrapd.com/driver-onboarding/** | Post-approve onboarding |
| **Command Center → Applications** | Hire pipeline (role filter: Drivers) |
| **Command Center → Drivers** | Live courier ops roster |
| **/courier** (Cloud Run) | Driver app after Activate |

Bridge: existing `https://api.wrrapd.com/api/wrapstars-wp-bridge` already allowlists `wrrapd/v1/*` including `/driver-applications`.

---

## Upload MU-plugins (from monorepo)

On SiteGround → `wp-content/mu-plugins/` (alongside WrapStars files):

| Repo file | Server path |
|-----------|-------------|
| `wordpress/wrrapd-drivers.php` | `mu-plugins/wrrapd-drivers.php` |
| `wordpress/wrrapd-drivers-apply.php` | `mu-plugins/wrrapd-drivers-apply.php` |
| `wordpress/wrrapd-drivers-ops-api.php` | `mu-plugins/wrrapd-drivers-ops-api.php` |
| `wordpress/wrrapd-drivers.css` | `mu-plugins/wrrapd-drivers.css` |
| `wordpress/wrrapd-wrapstars.php` | `mu-plugins/wrrapd-wrapstars.php` (Driver CTA on WrapStar landing → `/driver/`) |

Also keep WrapStars CSS (Drivers UI reuses tokens): `wrrapd-wrapstars.css`.

Optional wp-config:

```php
define( 'WRRAPD_BOLDSIGN_DRIVER_IC_TEMPLATE_ID', 'paste-driver-ic-template-id' );
define( 'WRRAPD_COURIER_APP_URL', 'https://YOUR_TRACKING_HOST/courier' );
```

Ops API key: reuse `WRRAPD_WRAPSTARS_OPS_API_KEY` (same header as WrapStars).

---

## Elementor pages

See [docs/wordpress-snippets/wrrapd-drivers-elementor-pages.md](../docs/wordpress-snippets/wrrapd-drivers-elementor-pages.md).

---

## Command Center / Cloud Run

No new bridge env vars. After deploying tracking-platform:

1. Applications → **Drivers** role filter
2. Approve → candidate emails → pros driver-onboarding
3. Activate → sync into Drivers roster (`DeliveryDriver` status `approved`)
4. Driver signs in at `/courier` with name/email/ID + contractor passcode

---

## Verify

1. `https://apply.wrrapd.com/driver/` — Driver landing
2. Submit test application → thank-you
3. Command Center Applications → Drivers → see under_review
4. Approve → email + login at `/driver-login/`
5. Complete onboarding placeholders on pros `/driver-onboarding/`
6. Activate → appears under Admin → Drivers
7. `/courier` login with activated name + passcode
