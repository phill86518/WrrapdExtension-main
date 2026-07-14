<!--
  WrapStars portal — Elementor page shortcodes (dedicated WordPress on apply + pros subdomains)

  ONE WordPress install; BOTH apply.wrrapd.com and pros.wrrapd.com point to the SAME document root.
  Do NOT install on wrrapd.com.

  === apply.wrrapd.com pages ===

  | Slug        | Title              | Shortcode                    |
  |-------------|--------------------|------------------------------|
  | /           | Become a WrapStar | [wrrapd_wrapstar_landing]    |
  | /apply/     | Apply              | [wrrapd_wrapstar_apply]      |
  | /dashboard/ | My Application     | [wrrapd_wrapstar_status]     |
  | /wrapstar-login/ | WrapStar Login | [wrrapd_wrapstar_login]   |
  | /decline-offer/ | Decline invitation | [wrrapd_wrapstar_decline] |

  === pros.wrrapd.com pages (parent: onboarding) ===

  | Slug                         | Title                 | Shortcode                                           |
  |------------------------------|-----------------------|-----------------------------------------------------|
  | /onboarding/                 | Onboarding            | [wrrapd_wrapstar_onboarding step="welcome"]         |
  | /onboarding/agreement/       | IC Agreement          | [wrrapd_wrapstar_onboarding step="agreement"]       |
  | /onboarding/policies/        | Policies (placeholder)| [wrrapd_wrapstar_onboarding step="policies"]        |
  | /onboarding/orientation/     | Orientation           | [wrrapd_wrapstar_onboarding step="orientation"]     |
  | /onboarding/background/      | Background (placeholder)| [wrrapd_wrapstar_onboarding step="background"]    |
  | /onboarding/insurance/       | Insurance             | [wrrapd_wrapstar_onboarding step="insurance"]       |
  | /onboarding/identity/        | Identity (placeholder)| [wrrapd_wrapstar_onboarding step="identity"]        |
  | /onboarding/po-box/          | PO Box                | [wrrapd_wrapstar_onboarding step="po_box"]          |
  | /onboarding/w-9/             | W-9                   | [wrrapd_wrapstar_onboarding step="w9"]              |
  | /onboarding/tax-1099/        | 1099 (placeholder)    | [wrrapd_wrapstar_onboarding step="tax_1099"]        |
  | /onboarding/bank-payout/     | Bank (placeholder)    | [wrrapd_wrapstar_onboarding step="bank_payout"]     |
  | /onboarding/activation/      | Activation            | [wrrapd_wrapstar_onboarding step="activation"]      |
  | /profile/                    | Profile               | [wrrapd_wrapstar_profile]                           |

  Theme: Hello Elementor (minimal). Do not import wrrapd.com header/footer.

  Settings → General:
    - WordPress Address: https://apply.wrrapd.com
    - Site Address: https://apply.wrrapd.com
  (pros.wrrapd.com works as alias to same install — host routing is in the MU-plugin.)

  After creating pages, log page IDs in docs/WORDPRESS-SITE-EDITS-LOG.md.
-->
