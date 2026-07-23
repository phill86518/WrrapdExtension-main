# Driver onboarding portal — map

Host: **pros.wrrapd.com/driver-onboarding/** (post-approval). Apply stays on **apply.wrrapd.com/driver/**.

Driver IC uses BoldSign when `WRRAPD_BOLDSIGN_DRIVER_IC_TEMPLATE_ID` is set; until then the agreement step is a placeholder acknowledgment (same pattern as WrapStar placeholders).

## Approval email → first login

Command Center **Applications → Drivers → Approve** emails from `admin@wrrapd.com`:

- Username = application email
- Temporary password = `Drive{NNNN}{A}!`
- Login → `apply.wrrapd.com/driver-login/` → pros driver-onboarding
- Decline → `apply.wrrapd.com/driver-decline/?app=…&token=…`
- **15-day** invite expiry (same TTL pattern as WrapStars)

## Step order

| # | Key | Path slug | Live vs placeholder |
|---|-----|-----------|---------------------|
| 1 | `welcome` | `/driver-onboarding/` | Live |
| 2 | `agreement` | `driver-agreement` | Placeholder (BoldSign Driver IC when template ID set) |
| 3 | `policies` | `driver-policies` | Placeholder |
| 4 | `orientation` | `driver-orientation` | Live quiz |
| 5 | `background` | `driver-background` | Placeholder |
| 6 | `insurance` | `driver-insurance` | Live file upload |
| 7 | `identity` | `driver-identity` | Placeholder |
| 8 | `w9` | `driver-w-9` | Placeholder |
| 9 | `tax_1099` | `driver-tax-1099` | Placeholder |
| 10 | `bank_payout` | `driver-bank-payout` | Placeholder |
| 11 | `activation` | `driver-activation` | Live (app CTA; ops Activate in Command Center) |

## Activate → Driver app

Activate in Command Center syncs into the **Drivers** ops roster (`DeliveryDriver`, status `approved`). Candidate then signs in at Cloud Run `/courier` (Capacitor shell: `tracking-platform/mobile/driver/`) with name/email/ID + contractor passcode.
