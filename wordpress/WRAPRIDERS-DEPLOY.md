# WrapRiders Portal — deployment (third hire track on apply + pros)

**WrapRider = wraps AND delivers.** This is the **third, fully separate hire category** next to WrapStars and JoyRiders: its own WordPress post type, its own application form, its own onboarding portal, its own ops API, and its own Command Center board. It never writes to the WrapStar CPT or the JoyRider CPT.

**Same WordPress install** as WrapStars and JoyRiders (`apply.wrrapd.com` + `pros.wrrapd.com`). Do not install on consumer `wrrapd.com`.

---

## The three tracks side by side

| | WrapStar | JoyRider | **WrapRider** |
|---|---|---|---|
| Apply | `apply.wrrapd.com/apply/` | `apply.wrrapd.com/drive/driver-apply/` | **`apply.wrrapd.com/wraprider/apply/`** |
| Landing | `apply.wrrapd.com/` | `apply.wrrapd.com/drive/` | **`apply.wrrapd.com/wraprider/`** |
| Onboarding portal | `pros.wrrapd.com/onboarding/` | `pros.wrrapd.com/driver-onboarding/` | **`pros.wrrapd.com/wraprider-onboarding/`** |
| WordPress CPT | `wrrapd_wrapstar_app` | `wrrapd_driver_app` | **`wrrapd_wraprider_app`** |
| WP roles | `wrapstar_*` | `driver_*` | **`wraprider_applicant` / `wraprider_approved` / `wraprider_active`** |
| Ops API | `/wrrapd/v1/applications` | `/wrrapd/v1/driver-applications` | **`/wrrapd/v1/wraprider-applications`** |
| WP Admin menu | WrapStars | Drivers | **WrapRiders** |
| Command Center board | `/admin/wrapstars` (IDs 8…) | `/admin/drivers` (IDs 7…) | **`/admin/wrapriders` (IDs 6…)** |
| Applications filter | WrapStars | JoyRiders | **WrapRiders** |
| Contractor app after Activate | wrapstar.wrrapd.com | joyrider.wrrapd.com | **wraprider.wrrapd.com only** |
| IC agreement | `WRRAPD_BOLDSIGN_IC_TEMPLATE_ID` | `WRRAPD_BOLDSIGN_DRIVER_IC_TEMPLATE_ID` | **`WRRAPD_BOLDSIGN_WRAPRIDER_IC_TEMPLATE_ID`** |
| Legal suite | `docs/legal/wrapstar-agreements/` | `docs/legal/joyrider-agreements/` | **`docs/legal/wraprider-agreements/`** |

---

## URLs served by the MU-plugin (virtual pages — no WP pages required)

| Host / path | Purpose |
|-------------|---------|
| **apply.wrrapd.com/wraprider/** | WrapRider landing |
| **apply.wrrapd.com/wraprider/apply/** | Application form (wrap + deliver questions) |
| **apply.wrrapd.com/wraprider/thank-you/** | Post-submit |
| **apply.wrrapd.com/wraprider/login/** | Approved WrapRider portal login |
| **apply.wrrapd.com/wraprider/decline/** | Decline invitation |
| **apply.wrrapd.com/wraprider/profile/** | Contact / mailing / vehicle edits while onboarding |
| **pros.wrrapd.com/wraprider-onboarding/** | Post-approve onboarding hub (12 steps, see below) |
| **Command Center → Applications → WrapRiders** | Hire pipeline |
| **Command Center → WrapRiders** | Live ops board (their only home) |
| **wrapstar.wrrapd.com** + **joyrider.wrrapd.com** | Contractor apps after Activate |

`/wraprider/*` on `pros` redirects to `apply`; `/wraprider-onboarding/*` on `apply` redirects to `pros` (same pattern as the other two tracks).

Bridge: the existing `https://api.wrrapd.com/api/wrapstars-wp-bridge` allowlists `wrrapd/v1/*`, which includes `/wraprider-applications`. No bridge change needed.

---

## Upload MU-plugins (from monorepo)

On SiteGround → `wp-content/mu-plugins/` (alongside the WrapStars and Drivers files):

| Repo file | Server path |
|-----------|-------------|
| `wordpress/wrrapd-wrapriders.php` | `mu-plugins/wrrapd-wrapriders.php` |
| `wordpress/wrrapd-wrapriders-apply.php` | `mu-plugins/wrrapd-wrapriders-apply.php` |
| `wordpress/wrrapd-wrapriders-apply.js` | `mu-plugins/wrrapd-wrapriders-apply.js` |
| `wordpress/wrrapd-wrapriders-ops-api.php` | `mu-plugins/wrrapd-wrapriders-ops-api.php` |
| `wordpress/wrrapd-wrapriders.css` | `mu-plugins/wrrapd-wrapriders.css` |
| `wordpress/wrrapd-wrapstars.php` | `mu-plugins/wrrapd-wrapstars.php` (landing CTA → `/wraprider/`; leaves `/wraprider/*` to this plugin) |
| `wordpress/wrrapd-wrapstars-ops-api.php` | `mu-plugins/wrrapd-wrapstars-ops-api.php` (`portal-auth` / `portal-password` / `portal-contact` now resolve WrapRiders) |
| `wordpress/wrrapd-drivers.php` | `mu-plugins/wrrapd-drivers.php` (FAQ link → `/wraprider/`) |
| `wordpress/wrrapd-boldsign.php` | `mu-plugins/wrrapd-boldsign.php` (WrapRider template helper) |

Keep the WrapStars CSS in place too (`wrrapd-wrapstars.css`) — the WrapRider UI reuses its tokens and adds a gold-on-navy accent from `wrrapd-wrapriders.css`.

### wp-config.php

```php
/* WrapRider IC agreement — a NEW BoldSign template built from docs/legal/wraprider-agreements/.
   Do not reuse the WrapStar or JoyRider template. */
define( 'WRRAPD_BOLDSIGN_WRAPRIDER_IC_TEMPLATE_ID', 'paste-wraprider-ic-template-id' );

/* Optional — the WrapRider's OWN app (default shown). WrapRiders never sign in to the WrapStar or JoyRider apps. */
define( 'WRRAPD_WRAPRIDER_APP_URL', 'https://wraprider.wrrapd.com' );
```

Ops API key: reuse `WRRAPD_WRAPSTARS_OPS_API_KEY` (same `X-Wrrapd-Wrapstars-Ops-Key` header as the other tracks).

Until the BoldSign constant is set, the `agreement` step is a placeholder acknowledgment (same as the JoyRider track). **Do not activate live WrapRiders until the third template is in.**

---

## Onboarding steps (`pros.wrrapd.com/wraprider-onboarding/`)

`wrrapd_wrapriders_onboarding_steps()` — 12 steps, wrap and delivery requirements both covered:

| Step key | Path | Title |
|---|---|---|
| `welcome` | `/wraprider-onboarding/` | Welcome & Overview |
| `agreement` | `/wraprider-agreement/` | WrapRider Independent Contractor Agreement |
| `policies` | `/wraprider-policies/` | Wrap & Delivery Standards |
| `orientation` | `/wraprider-orientation/` | Orientation & Quiz |
| `background` | `/wraprider-background/` | Background Check |
| `insurance` | `/wraprider-insurance/` | Vehicle Insurance |
| `identity` | `/wraprider-identity/` | Identity & License |
| `workspace` | `/wraprider-workspace/` | Wrapping Location |
| `w9` | `/wraprider-w-9/` | W-9 Tax Form |
| `tax_1099` | `/wraprider-tax-1099/` | 1099 & Tax Acknowledgments |
| `bank_payout` | `/wraprider-bank-payout/` | Connect Bank / Payouts |
| `activation` | `/wraprider-activation/` | Apps & Final Review |

---

## Command Center / Cloud Run

Deploy `tracking-platform` (see root [DEPLOYMENT.md](../DEPLOYMENT.md), step 4). No new env vars.
Map the third portal host **`wraprider.wrrapd.com`** to the `wrrapd-tracking` Cloud Run service exactly like the other two (see [docs/CONTRACTOR-PORTALS.md](../docs/CONTRACTOR-PORTALS.md) §4).

1. **Applications → WrapRiders** filter reads `/wraprider-applications` only.
2. **Approve** → candidate email with username, temporary password, and the `wraprider-onboarding` link.
3. **Approve onboarding (Activate)** → `syncActivatedApplicationToWrapriderRoster`:
   - creates / updates the **WrapRiders board row** (ID prefix **6**) — their home;
   - creates hidden **capacity** rows on the WrapStar roster (8…) and DeliveryDriver roster (7…), tagged `hireRole: "wraprider"`. These exist only so order allocation can hand the WrapRider wrap jobs and deliveries — they are **not logins** (the WrapStar and JoyRider apps refuse them) and `/admin/wrapstars` / `/admin/drivers` filter them out;
   - writes the contractor record under the WrapRider id (`wraprider:6…`).
4. **WrapRider App — `wraprider.wrrapd.com`** (`/wraprider`, `POST /api/wraprider/login`, session role `wraprider`). Own login: WordPress `portal-auth` with `portal=wraprider` checks the WrapRider CPT only and reports `roles.wraprider` only — nothing is mirrored into the WrapStar / JoyRider role slots. A WrapRider who tries wrapstar.wrrapd.com or joyrider.wrrapd.com is told to use wraprider.wrrapd.com, and vice versa.
5. **Pay** — third pay structure: Command Center → Finance → Hourly rates has a **WrapRider default** and an optional 4th ZIP column (`ZIP WrapStar$ JoyRider$ WrapRider$`).
6. **Move stream** — from a WrapRider application in Under review / Interview, Command Center can **Move this application to WrapStar** or **Move this application to JoyRider**. WordPress creates a new CPT in that stream with mapped fields, marks the WrapRider post `[Switched to …]`, and archives unused answers on the source. Hire then continues in the target stream only.

---

## Verify

1. `https://apply.wrrapd.com/wraprider/` — WrapRider landing (gold-on-navy accent); view-source includes `2026-09-18-move-stream` (or current `WRRAPD_WRAPRIDERS_BUILD`)
2. Submit a test application → `/wraprider/thank-you/`
3. **WP Admin → WrapRiders** shows the card; **Command Center → Applications → WrapRiders** shows `under_review`
4. Approve → email → login at `/wraprider/login/` → `pros.wrrapd.com/wraprider-onboarding/` (requires `pros` host on the hire WordPress — see CURRENT-STATE)
5. Walk the 12 steps (placeholders acknowledge until BoldSign / vendors are wired)
6. Activate → appears under **Command Center → WrapRiders** (ID 6…), **not** on WrapStars or JoyRiders
7. Sign in at **`wraprider.wrrapd.com/wraprider`** with the same email + password. WrapStar / JoyRider apps must refuse this account and point them to wraprider.
8. Optional: from a test WrapRider in Under review, **Move to WrapStar** / **Move to JoyRider** — source shows `[Switched to …]`; new app opens under review in that stream.

---

## GitHub / VM push

```bash
cd /home/phill/wrrapd-GCP
git status
git add wordpress/wrrapd-wrapriders*.php wordpress/wrrapd-wrapriders-apply.js wordpress/wrrapd-wrapriders.css \
        wordpress/wrrapd-wrapstars.php wordpress/wrrapd-wrapstars-ops-api.php wordpress/wrrapd-drivers.php \
        wordpress/wrrapd-boldsign.php wordpress/WRAPRIDERS-DEPLOY.md tracking-platform/src \
        docs/CURRENT-STATE-2026-09-18.md
git commit -m "WrapRiders: third hire track — own CPT, apply, onboarding, ops API, Command Center"
git push origin main
```

Then ensure SiteGround MU files are current (see CURRENT-STATE) and deploy `tracking-platform` to Cloud Run when Command Center code changes. **No PM2 restart** — `WrrapdServer` is untouched.

## ESIGN click-to-accept (required for Agreements step)

Also deploy:

| Repo | SiteGround `mu-plugins/` |
|------|--------------------------|
| `wordpress/wrrapd-esign-agreements.php` | `wrrapd-esign-agreements.php` |
| `wordpress/legal-agreements/` | `legal-agreements/` (entire folder) |
| `wordpress/wrrapd-wrapstars.css` | `wrrapd-wrapstars.css` (ESIGN styles) |

The Agreements onboarding step is Uber-style **I Accept** (ESIGN Act). BoldSign is no longer used for the IC packet (W-9 may still use BoldSign when configured).

