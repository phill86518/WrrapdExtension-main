# WrapStar onboarding portal — comprehensive map

Host: **pros.wrrapd.com** (post-approval). Apply stays on **apply.wrrapd.com**.

> Internal operating model and public-copy rules: **[WRAPSTARS-OPERATIONS-MODEL.md](./WRAPSTARS-OPERATIONS-MODEL.md)** (never publish).

Last major revision: **2026-09-09** — every step is now a real, completable screen (no "placeholder"
language shown to WrapStars), the old "PO Box" step became **Wrapping Location & Handoff**, the rail is
grouped with time estimates, and the orientation reflects the courier-drop / courier-pickup workflow.

---

## Approval email → first login

Command Center and WP Admin can **Approve without interview** (skip Zoom) or **Passed interview — approve**. Both send the same welcome email from `admin@wrrapd.com`. Skipped interviews are stored as `interview_skipped` on the application.

Command Center **Approve** emails from `admin@wrrapd.com`:

- Welcome / congratulations copy
- **Username** = application email
- **Temporary password** = readable form like `Wrap4827K!` (must change on first login)
- Login link → `apply.wrrapd.com/wrapstar-login/` → pros onboarding
- **Decline this offer** link → `apply.wrrapd.com/decline-offer/?app=…&token=…` (no login)
- **15-day expiry:** login link, temporary password, and Decline link expire 15 days after credentials are issued (Approve / Resend / Re-invite). After expiry, portal access is blocked until ops **Resend welcome email** or **Re-open invitation**. Activated WrapStars are not affected.

First login always shows **Choose your password** before any onboarding step. Declined invitations become status `declined` in **Applications → Declined offer** (credentials invalidated).

### Re-open after decline

1. Command Center → **Applications → Declined offer** → open the application
2. Optionally update reviewer notes
3. Click **Re-open invitation & resend welcome email**

That sets status back to **Approved (onboarding)**, issues a new temporary password + Decline link, and sends a "welcome back" email. While they are approved, **Resend welcome email** reissues credentials without changing status.

---

## Step registry (single source of truth)

`wordpress/wrrapd-wrapstars.php` → `wrrapd_wrapstars_onboarding_step_registry()`.
Each entry has `label`, `short` (rail sub-line), `minutes` (estimate), `path`, `group` (rail header).
Order = unlock order (a step opens only when every earlier step is complete).

| # | Key | Group | Screen | What the WrapStar does | Stored meta (`_wrrapd_ws_*`) |
|---|-----|-------|--------|------------------------|------------------------------|
| 1 | `welcome` | Get started | Welcome | Sees grouped overview + total minutes; clicks **Let's begin** | `step_welcome` |
| 2 | `agreement` | Agreements | IC Agreement | **BoldSign** embedded e-sign | `boldsign_ic_*`, `step_agreement` |
| 3 | `policies` | Agreements | WrapStar Standards & Policies | Reads 5 sections (`wrrapd_wrapstars_policy_sections()`), ticks each, types name to sign | `policies_ack_sections`, `policies_ack_at`, `policies_signature`, `step_policies` |
| 4 | `orientation` | Training | Orientation & Quiz | Reads 4 modules (`wrrapd_wrapstars_orientation_modules()`), passes quiz ≥ 80% (`wrrapd_wrapstars_orientation_questions()`) | `orientation_score`, `step_orientation` |
| 5 | `background` | Verification | Background Check | FCRA-style disclosure, legal name, other names, consent, typed signature | `bg_legal_name`, `bg_other_names`, `bg_consent_at`, `bg_signature`, `bg_status` (ops sets pending/clear/review), `step_background` |
| 6 | `insurance` | Verification | Proof of Insurance | Uploads COI ($1M GL + inland marine/bailee); optional carrier + expiry | `insurance_file`, `insurance_carrier`, `insurance_expires`, `step_insurance` |
| 7 | `identity` | Verification | Identity Verification | Confirms ID on file; uploads selfie holding ID | `identity_selfie_file`, `identity_confirmed_at`, `step_identity` |
| 8 | `workspace` | Your setup | Wrapping Location & Handoff | Drop-off/pickup address (prefilled from application), handoff-window chips (`wrrapd_wrapstars_workspace_window_options()`), courier access notes, optional photo | `workspace_address`, `workspace_windows`, `workspace_access_notes`, `workspace_photo_file`, `step_workspace` (legacy `step_po_box` still counts) |
| 9 | `w9` | Tax & payouts | W-9 Tax Form | **BoldSign** embedded e-sign | `boldsign_w9_*`, `step_w9` |
| 10 | `tax_1099` | Tax & payouts | Tax Acknowledgments | 3 required confirmations (IC status, no withholding, W-9 accuracy) + optional e-delivery consent + typed signature | `tax_ack_at`, `tax_ack_signature`, `tax_e_delivery`, `step_tax_1099` |
| 11 | `bank_payout` | Tax & payouts | Payout Setup | **If `WRRAPD_WRAPSTARS_PAYOUT_CONNECT_URL` is defined:** button to hosted payout onboarding + confirm checkbox. **Otherwise:** direct-deposit form (holder, bank, type, routing, account ×2) + voided check/bank letter upload. Only **last 4** of the account number is stored. | `payout_method`, `payout_holder_name`, `payout_bank_name`, `payout_account_type`, `payout_routing`, `payout_account_last4`, `payout_proof_file`, `payout_submitted_at`, `step_bank_payout` |
| 12 | `activation` | Finish | Final Review | Checklist; "Pending activation" once all done; "while you wait" tips | ops sets `status=active` via Command Center → `step_activation` |

Legacy: `po_box` (key, shortcode attr, `/onboarding/po-box/` URL) all map to `workspace` via
`wrrapd_wrapstars_normalize_step_key()` / `wrrapd_wrapstars_detect_onboarding_step_from_uri()`.

### Shell / UX

- Left rail: brand, greeting, progress bar (`n of 11 steps done · about N min left`), grouped steps
  with two-line labels (name + `short`; "Complete" when done), Profile / Help / Log out.
- Stage header: `Group · Step X of 12 · about N min`.
- Footer on every step: **Up next** (label + minutes) and a "progress is saved" help line.
- Mobile: rail slides in from the left via the **Steps** button (unchanged).
- Typed e-signature helper: `wrrapd_wrapstars_render_signature_field( $name )`.

### Submit handling

`wrrapd_wrapstars_process_onboarding_step()` — one `switch` on the normalized step key. Errors go to
`$GLOBALS['wrrapd_ws_onboarding_error']` and are shown above the step. Successful steps call
`wrrapd_wrapstars_mark_step_complete()` and redirect to `wrrapd_wrapstars_next_onboarding_step()`.
Orientation quiz has its own handler (`wrrapd_wrapstars_process_orientation_quiz`, nonce `wrrapd_ws_quiz`).

Uploads go to `wp-content/wrapstars-private/<app-id>/` (mirrored to GCS when
`WRRAPD_WRAPSTARS_GCS_UPLOAD_URL` is configured).

---

## Ops verification before **Activate**

Data is exposed two ways:

1. **Command Center → Applications → detail** (ops API `wordpress/wrrapd-wrapstars-ops-api.php` →
   `onboarding` object: signatures, bg status, insurance carrier/expiry, workspace address + windows,
   payout summary with routing + last4, file flags).
2. **WP Admin → WrapStars** card (fallback) → "Onboarding (portal)" table with download links for COI,
   selfie, workspace photo, voided check, plus a **Background check status** selector
   (`save_bg_status` admin action).

Checklist:

1. IC signed (BoldSign)
2. Policies signed (all 5 sections)
3. Orientation quiz ≥ 80%
4. Background: consent recorded → run with screening partner → set status **Clear**
5. Insurance COI verified (limits, dates, inland marine line)
6. Identity selfie matches application ID
7. Wrapping location + handoff windows on file (used for courier scheduling)
8. W-9 signed
9. Tax acknowledgments signed
10. Payout details verified against voided check / bank letter; entered into payout system

---

## Editing copy

| Want to change… | Edit |
|---|---|
| Step names, sub-lines, minutes, URLs, groups | `wrrapd_wrapstars_onboarding_step_registry()` |
| Policy sections / bullet points | `wrrapd_wrapstars_policy_sections()` |
| Orientation modules | `wrrapd_wrapstars_orientation_modules()` |
| Quiz questions / correct answers | `wrrapd_wrapstars_orientation_questions()` (`a` = key of correct choice) |
| Handoff window choices | `wrrapd_wrapstars_workspace_window_options()` |
| Any step's on-screen text | `wrrapd_wrapstars_render_step_<key>()` |
| Background disclosure legal text | `wrrapd_wrapstars_render_step_background()` |
| Payout: switch to hosted provider | define `WRRAPD_WRAPSTARS_PAYOUT_CONNECT_URL` in `wp-config.php` |
| Styles | `wordpress/wrrapd-wrapstars.css` → section "Onboarding portal — 2026-09 refresh" |

Public-copy rules still apply behind login: describe **what the WrapStar does**, never routing,
pricing, percentages, tips, or other roles' operations.

---

## SiteGround pages

Create child pages under `onboarding` (see `docs/wordpress-snippets/wrrapd-wrapstars-elementor-pages.md`).
New for 2026-09: **`/onboarding/workspace/`** with `[wrrapd_wrapstar_onboarding step="workspace"]`.
The old `/onboarding/po-box/` page may stay (it renders the workspace step) or be deleted.

Upload MU-plugins (see `wordpress/WRAPSTARS-DEPLOY.md`):

- `wrrapd-wrapstars.php`, `wrrapd-wrapstars.css`, `wrrapd-wrapstars-apply.php`,
  `wrrapd-wrapstars-apply.js`, `wrrapd-wrapstars-ops-api.php`

Then purge cache and confirm view-source shows `WRRAPD_WRAPSTARS_BUILD` = `2026-09-09-wrapstars-refresh`.

---

## Related code

- Step registry: `wordpress/wrrapd-wrapstars.php` → `wrrapd_wrapstars_onboarding_step_registry()`
- Landing copy: `wrrapd_wrapstars_landing_content()`
- Apply form: `wordpress/wrrapd-wrapstars-apply.php` (+ `wrrapd-wrapstars-apply.js`)
- Ops API: `wordpress/wrrapd-wrapstars-ops-api.php`
- Deploy: `wordpress/WRAPSTARS-DEPLOY.md`
