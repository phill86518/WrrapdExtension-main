<!--
  Drivers portal — Elementor page shortcodes (same WP install as WrapStars)

  ONE WordPress; apply.wrrapd.com + pros.wrrapd.com → same document root.
  Public name: **JoyRider**. Code / slugs still say driver. Parent landing slug is `drive`
  (live) or `driver` (legacy). The apply form redirects to `/drive/driver-thank-you/`.

  === apply.wrrapd.com pages ===

  | Permalink                         | Example title           | Shortcode                 |
  |-----------------------------------|-------------------------|---------------------------|
  | /drive/                           | Become a JoyRider       | [wrrapd_driver_landing]   |
  | /drive/driver-apply/              | JoyRider Apply          | [wrrapd_driver_apply]     |
  | /drive/driver-thank-you/          | JoyRider Thank You      | [wrrapd_driver_thankyou]  |  **required — do not put the landing shortcode here** |
  | /drive/driver-login/              | JoyRider Login          | [wrrapd_driver_login]     |
  | /drive/decline-driver/            | Decline invitation      | [wrrapd_driver_decline]   |

  Parent for apply + thank-you: page with slug `driver`.
  Login + decline: top-level (no parent).

  WrapStar landing links to /driver/.

  === Onboarding pages (create in same WP Admin; used on pros host) ===

  Parent slug: `driver-onboarding`

  | Permalink                                          | Shortcode                                              |
  |----------------------------------------------------|--------------------------------------------------------|
  | /driver-onboarding/                                | [wrrapd_driver_onboarding step="welcome"]              |
  | /driver-onboarding/driver-agreement/               | [wrrapd_driver_onboarding step="agreement"]            |
  | /driver-onboarding/driver-policies/                | [wrrapd_driver_onboarding step="policies"]             |
  | /driver-onboarding/driver-orientation/             | [wrrapd_driver_onboarding step="orientation"]          |
  | /driver-onboarding/driver-background/              | [wrrapd_driver_onboarding step="background"]           |
  | /driver-onboarding/driver-insurance/               | [wrrapd_driver_onboarding step="insurance"]            |
  | /driver-onboarding/driver-identity/                | [wrrapd_driver_onboarding step="identity"]             |
  | /driver-onboarding/driver-w-9/                     | [wrrapd_driver_onboarding step="w9"]                   |
  | /driver-onboarding/driver-tax-1099/                | [wrrapd_driver_onboarding step="tax_1099"]             |
  | /driver-onboarding/driver-bank-payout/             | [wrrapd_driver_onboarding step="bank_payout"]          |
  | /driver-onboarding/driver-activation/              | [wrrapd_driver_onboarding step="activation"]           |

  Permalinks: Post name. Theme: Hello Elementor.
-->
