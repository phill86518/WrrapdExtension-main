# WrapStars & Drivers — operating model (INTERNAL, development only)

> **Confidential. Never publish.** This document exists so engineers and content editors understand
> *why* the public WrapStar pages say what they say. Nothing in the "How the network actually works"
> section may appear on `apply.wrrapd.com`, `pros.wrrapd.com`, `wrrapd.com`, in emails, or in any
> customer- or applicant-facing string. See "Public-copy rules" below before editing any copy.

Last updated: 2026-09-13 (hourly-by-ZIP pay; no pay mechanics on public pages).

---

## 1. How the network actually works (do not publish)

Wrrapd is **not** a DoorDash-style marketplace where a contractor sees an order, accepts it, picks it
up, does the work, and delivers it. Wrrapd is an **aggregator + router**:

1. **Wrrapd receives e-commerce orders** (extension checkout, wrrapd.com, partner flows) and
   aggregates them.
2. Wrrapd **routes each order intelligently** (ZIP proximity, load, rank — see
   `tracking-platform/src/lib/allocation.ts`) to:
   - a **WrapStar** (independent gift-wrapper, 1099) for the wrapping work, and/or
   - a **JoyRider** (internal code still says Driver / courier; 1099) for logistics and floral work.
3. **JoyRiders** own every physical hop and are the *only* role that ever meets the end customer:
   1. collect inbound retailer packages from Wrrapd **PO Boxes**;
   2. **drop packages to the assigned WrapStar** at a scheduled handoff window;
   3. **purchase flowers** when an order requires them;
   4. **collect the finished, wrapped gifts** from the WrapStar and combine them with the floral
      order when applicable;
   5. **make the final delivery** to the giftee.
4. **WrapStars never see or contact the customer/giftee.** They receive packages at their
   wrapping location, wrap to Wrrapd standards, document the work (photo/video), and hand the
   finished gifts back to the JoyRider.

### Consequences the product must respect

| Topic | Rule | Where it shows up |
|---|---|---|
| Tips | WrapStars **cannot receive tips** today (restaurant analogy: the chef does not get the table's tip; the wait-staff / JoyRider does). A WrapStar tip-sharing feature may come later. **Do not mention tips anywhere on WrapStar pages.** | Landing, apply, onboarding, emails |
| Pay | **Hourly by ZIP** for WrapStars **and** JoyRiders — not per order. WrapStar expected pace is **12 gifts/hour**; shortfall reduces that hour by `(hourly ÷ 12)` per unfinished gift. WrapStars buy paper, small boxes, scissors, cutters, and tape. **Never publish rates, hourly, per-order, pace, penalties, ZIP tables, or "how you get paid."** Public pages omit pay entirely; details live in onboarding + the contractor app. | `docs/CONTRACTOR-HOURLY-PAY.md`, `docs/legal/contractor-compensation-schedule.md`, Command Center → Finance → Hourly rates |
| Delivery / pickup | WrapStars do **not** drive, deliver, pick up from PO Boxes, or hand off to carriers. Public copy: "packages are brought to you and collected when you're done — no driving." | Landing FAQ/how-it-works, apply form (delivery questions removed), orientation |
| PO Boxes | PO Boxes are a **JoyRider** concern. WrapStar onboarding no longer has a "PO Box" step; it has **Wrapping Location & Handoff** (`workspace`). | `wrrapd_wrapstars_onboarding_steps()` |
| Flowers | Floral sourcing/combination is a **JoyRider** concern. Do not mention flowers on WrapStar pages. | — |
| Routing / aggregation | Never describe aggregation, re-routing, allocation logic, ZIP proximity, ranks, or the extension. | — |
| Turnaround | Public copy may say "tight turnaround — usually same day," framed as a craft standard, not as an ops SLA. | Landing "Hit your window" |
| Proof | WrapStars document each order with photo/video (chain of custody). Public copy: "share a quick photo or short video of the finished wrap." Internal onboarding may say more (unboxing → wrap → handoff to your Wrrapd courier). | Apply ack, orientation |
| Insurance | Still required before activation (GL + inland marine/bailee). Public copy: "insurance verification during onboarding." | Landing requirements, onboarding `insurance` |

---

## 2. Public-copy rules (apply to every Wrrapd web property)

1. **Never outline the business model.** No "we aggregate," "we route," "orders come from our
   Chrome extension," "Drivers collect from PO Boxes," "Drivers buy flowers," etc.
2. **No pay mechanics — and no “how you get paid” at all on public pages.** No hourly, per-order,
   percentages, base pay, peak pay, bonuses, tips, pace, ZIP rates, "see payout before you accept,"
   or fee language. Do not add a “How do I get paid?” FAQ. Onboarding and the contractor apps may
   describe the Compensation Schedule after approval.
3. **No tips on WrapStar pages** (see above).
4. **WrapStars wrap. Full stop.** Do not describe them picking up, delivering, meeting customers, or
   handing off to carriers. Allowed: "packages are brought to you and collected when you're done."
5. **JoyRider pages** may describe pickup + delivery generically ("pick up finished gifts, deliver
   to the door") but must not describe PO Boxes, floral purchasing, or WrapStar routing. Public
   name is **JoyRider**; URLs and code may still say `/drive/` and `driver`.
6. **Short, warm, plain labels** in shopper/applicant UI (see `.cursor/rules/customer-facing-copy.mdc`).
7. **Internal words to avoid in public strings:** Command Center, ops, allocation, allocator, ingest,
   platform take, placeholder, vendor, TBD, BoldSign (use "e-sign"), Checkr/Persona/Stripe
   (use "our screening partner" / "secure payout setup").
8. When in doubt, describe the **applicant's experience** ("what you do, what you need, what
   happens next") — never **our operations**.

---

## 3. Where WrapStar copy lives (edit map)

| Surface | File / function | Notes |
|---|---|---|
| Landing `apply.wrrapd.com/` | `wordpress/wrrapd-wrapstars.php` → `wrrapd_wrapstars_landing_content()` (all copy as arrays) and `wrrapd_wrapstars_shortcode_landing()` (markup) | Edit copy in the content array; markup loops over it |
| Social / SEO cards | `wrrapd_wrapstars_social_card_for_path()` | og:description per path |
| Apply form | `wordpress/wrrapd-wrapstars-apply.php` → `wrrapd_wrapstars_shortcode_apply()`; validation in `wrrapd_wrapstars_process_application()`; scoring `wrrapd_wrapstars_compute_fit_score()` | Client wizard: `wordpress/wrrapd-wrapstars-apply.js` (review rows + TIDBITS) |
| Thank-you page | `wrrapd_wrapstars_shortcode_thankyou()` — forced on `/thank-you/` even if the WP page has the wrong shortcode | WP page should still contain only `[wrrapd_wrapstar_thankyou]` |
| Approval / invite emails | `wrrapd_wrapstars_send_approval_credentials_email()` | |
| Onboarding portal | `wrrapd_wrapstars_onboarding_step_registry()` (labels, blurbs, minutes, slugs) + `wrrapd_wrapstars_render_step_*()` | See `docs/WRAPSTAR-ONBOARDING-PORTAL.md` |
| Orientation content + quiz | `wrrapd_wrapstars_orientation_modules()` / `wrrapd_wrapstars_orientation_questions()` | Quiz answers keyed by `a` |
| Policies text | `wrrapd_wrapstars_policy_sections()` | Each section = one acknowledgment |
| Styles | `wordpress/wrrapd-wrapstars.css` (`.wrrapd-wrapstars-onboarding*`, `.wrrapd-wrapstars-ob-*`, landing `.wrrapd-wrapstars-dasher*`) | |
| Build marker | `WRRAPD_WRAPSTARS_BUILD` in `wrrapd-wrapstars.php` | Bump on every deploy; check view-source |

Deploy: `wordpress/WRAPSTARS-DEPLOY.md` (SiteGround `mu-plugins/`, purge cache). WordPress-only —
no PM2 or Cloud Run restart.

---

## 4. Roles glossary (internal)

- **WrapStar** — independent gift-wrapper. Wraps at their own location. No customer contact. No tips (for now).
- **JoyRider** — **public / Command Center name** (decided 2026-09-09) for the independent courier. Same person as the internal **Driver** role. PO Box collection, WrapStar drop/pickup, floral purchase, final delivery. Only customer-facing role.
- **WrapRider** — **public / Command Center name** (decided 2026-09-16) for the **hybrid** contractor who both wraps and delivers. **Fully separate third hire track** (decided 2026-09-17): own WordPress CPT `wrrapd_wraprider_app` (`wordpress/wrrapd-wrapriders*.php`), own apply form `/wraprider/apply/`, own onboarding portal `pros.wrrapd.com/wraprider-onboarding/`, own ops API `/wraprider-applications`, own WP Admin menu, and **own Command Center category** at `/admin/wrapriders` (IDs prefix **6**). Never stored on the WrapStar or JoyRider CPT. **Own app + own login:** `wraprider.wrrapd.com` (`/wraprider`, session role `wraprider`, `POST /api/wraprider/login`) — WrapRiders are refused on the WrapStar and JoyRider apps and vice versa. **Own pay structure:** WrapRider hourly default + optional 4th ZIP column in Finance → Hourly rates. Activate creates the WrapRider ops row (the login identity); tagged wrapstar (8) + courier (7) rows exist only as **capacity** for order allocation — not logins — and are **hidden** from the WrapStars and JoyRiders boards. Legal suite: `docs/legal/wraprider-agreements/`. Deploy: `wordpress/WRAPRIDERS-DEPLOY.md`.
- **Driver** — **code / URL / CPT name only** (`wrrapd-drivers.php`, `/drive/`, `wrrapd_driver_app`, `courierDriverId`, Command Center route `/admin/drivers`). Do not introduce a second CPT. When adding UI copy, say JoyRider.
- **Command Center** — `tracking-platform` admin (Cloud Run). Applications, WrapStars, JoyRiders (`/admin/drivers`), WrapRiders (`/admin/wrapriders`), Orders, Finance, Pricing.
- **WrapStar Console** — `tracking-platform` `/wrapstar` companion UI (queue, calendar, availability).
- **JoyRider / courier app** — `tracking-platform` `/courier` (internal route may still say driver).
- **Portal** — WordPress `apply.wrrapd.com` (public + apply) / `pros.wrrapd.com` (approved-only onboarding).
