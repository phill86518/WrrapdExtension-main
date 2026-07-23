<!--
  Drivers portal — Elementor page shortcodes (same WP install as WrapStars)

  ONE WordPress; apply.wrrapd.com + pros.wrrapd.com → same document root.
  All Driver page slugs use a driver- prefix (except parent landing slug "driver").

  === apply.wrrapd.com pages ===

  | Permalink                         | Example title           | Shortcode                 |
  |-----------------------------------|-------------------------|---------------------------|
  | /driver/                          | Drive with Wrrapd       | [wrrapd_driver_landing]   |
  | /driver/driver-apply/             | Driver Apply            | [wrrapd_driver_apply]     |
  | /driver/driver-thank-you/         | Driver Thank You        | [wrrapd_driver_thankyou]  |
  | /driver-login/                    | Driver Login            | [wrrapd_driver_login]     |
  | /driver-decline/                  | Decline Driver          | [wrrapd_driver_decline]   |

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
