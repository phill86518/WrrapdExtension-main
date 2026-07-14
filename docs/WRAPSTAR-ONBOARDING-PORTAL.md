# WrapStar onboarding portal — comprehensive map

Host: **pros.wrrapd.com** (post-approval). Apply stays on **apply.wrrapd.com**.

BoldSign stays wired for **IC Agreement** and **W-9**. Everything marked *placeholder* accepts an acknowledgment today so you can test the full path; swap in real PDFs / vendors when you supply them.

## Step order

| # | Key | Live vs placeholder | What you will provide |
|---|-----|---------------------|------------------------|
| 1 | `welcome` | Live | — |
| 2 | `agreement` | **BoldSign IC** | Final IC PDF + BoldSign template ID (if not already set) |
| 3 | `policies` | Placeholder | Handbook, video-proof policy, brand/code-of-conduct PDFs |
| 4 | `orientation` | Live (quiz) | Optional training videos / richer modules |
| 5 | `background` | Placeholder | Vendor choice (e.g. Checkr) + disclosure packet |
| 6 | `insurance` | Live (COI upload) | Optional verification checklist / expiry rules |
| 7 | `identity` | Placeholder | Optional selfie / liveness vendor |
| 8 | `po_box` | Live | Optional USPS / Form 1583 guidance PDF |
| 9 | `w9` | **BoldSign W-9** | IRS W-9 template in BoldSign (if not already set) |
| 10 | `tax_1099` | Placeholder | 1099-NEC / IC tax acknowledgment PDF (counsel) |
| 11 | `bank_payout` | Placeholder | Stripe Connect (or Plaid) + ACH schedule disclosure |
| 12 | `activation` | Live (pending ops) | Ops activate in Command Center → Applications |

## How placeholders work

Each placeholder step shows:

- What the step will do
- Exact document / vendor assets still needed from you
- Checkbox acknowledgment so testers can continue
- Optional notes field stored on the application

When you deliver files, we replace the placeholder body with PDF upload, BoldSign, or Stripe Connect — **without reordering steps**.

## SiteGround pages to add

Create child pages under `onboarding` (see `docs/wordpress-snippets/wrrapd-wrapstars-elementor-pages.md`):

- `policies`, `background`, `identity`, `tax-1099`, `bank-payout`

Upload MU-plugins:

- `wrrapd-wrapstars.php`
- `wrrapd-wrapstars.css`
- (existing BoldSign / apply / ops-api unchanged for this feature)

## Admin activation checklist

Before **Activate** in Command Center:

1. IC signed (BoldSign)
2. Policies acknowledged (or final PDFs signed)
3. Orientation quiz passed
4. Background clear (when vendor live)
5. Insurance COI verified
6. Identity verified (when vendor live)
7. PO Box on file
8. W-9 signed
9. 1099 acknowledgment on file
10. Bank / payout connected (when Stripe live)

## Related code

- Step registry: `wordpress/wrrapd-wrapstars.php` → `wrrapd_wrapstars_onboarding_steps()`
- Placeholder copy: `wrrapd_wrapstars_placeholder_step_config()`
- Deploy: `wordpress/WRAPSTARS-DEPLOY.md`
