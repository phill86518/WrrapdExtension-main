# WordPress site edits log (`wrrapd.com`)

WordPress + Elementor + Hello theme content mostly lives **in the production database**, not in this Git repository. This file is the **engineering changelog** so agents and humans know what was changed, **where** (post / widget ids when known), and **why**.

**Convention:** Append new rows to the top under “Recent changes.” Include date (UTC or US Eastern, be consistent—below uses **approximate session dates** from engineering work in **April 2026**).

---

## Recent changes

### 2026-04 — Orders shortcode `layout="cards"` (Jet listing vs pay-server)

- **Monorepo:** `[wrrapd_review_orders layout="cards"]` — card UI + occasion `<select>` filter from pay-server JSON; remove JetEngine “Associated Id / No. of Files” listing on the same page if both appear.

### 2026-04 — Logout confirmation page + slower CTA blink (repo + optional CSS)

- **Logout:** MU plugin `wordpress/wrrapd-orders-bridge.php` hooks `login_init` priority **0**: if `action=logout`, user is logged in, and `_wpnonce` is missing or invalid for `log-out`, **redirect once** to `wp_logout_url()` so WordPress performs an immediate logout instead of the “Do you really want to log out?” interstitial (common when Elementor uses a bare `wp-login.php?action=logout` link). Re-upload `mu-plugins/wrrapd-orders-bridge.php` after pull.
- **Blink:** Optional snippet **[`docs/wordpress-snippets/wrrapd-slower-cta-blink.css`](wordpress-snippets/wrrapd-slower-cta-blink.css)** — append to Hello / global Additional CSS (post **6064** or successor); tune `3.5s` as desired. If existing CSS already defines `@keyframes`, prefer lengthening that animation’s duration to avoid duplicate rules.

### 2026-04 — “Review Wrrapd Orders”: claim on login + order table (repo MU plugin)

- **Monorepo:** `wordpress/wrrapd-orders-bridge.php` + `wordpress/README.md` — copy PHP file to **`wp-content/mu-plugins/`**; add **`WRRAPD_INTERNAL_API_KEY`** (same value as VM **`WRRAPD_INTERNAL_CLAIM_SECRET`**) and optional **`WRRAPD_API_BASE`** to **`wp-config.php`**.
- **Pay server:** deploy commit with **`POST /api/internal/orders-for-wp-user`**; **`pm2 restart wrrapd-server`**.
- **Elementor:** on the Review page, add shortcode **`[wrrapd_review_orders]`** (Shortcode widget or equivalent). Keeps existing per-order WP fields separate; table lists pay-server orders for the logged-in email.

### 2026-04 — Chrome Web Store: wire CTAs + welcome “here” link

- **Listing:** [Wrrapd on the Chrome Web Store](https://chromewebstore.google.com/detail/wrrapd/eampapdpkmnnbfdojhmbpckpljnbpapo)
- **Elementor:** Homepage **4857** button widget **`eb0b235`** and Theme Builder header **6078** button **`7f1bdc1`** — set **`settings.link.url`** to that listing (`is_external` true). Cleared Elementor cache for **4857** and **6078**.
- **Welcome page 5576:** Replaced mistaken `chromewebstore.google.com/category/extensions` “here” link with the **direct Wrrapd listing** URL in `_elementor_data` and synced **`post_content`**.
- **Homepage 4857 `post_content`:** Replaced placeholder **`href="#"`** on the FREE extension CTA with the listing URL (Elementor HTML cache).

### 2026-04 — Welcome heading showed raw `[elementor-tag …]` (fix)

- **Cause:** Elementor Pro resolves dynamic tags from the **`__dynamic__`** control map (e.g. `__dynamic__.title`), not from a literal `[elementor-tag …]` string stored only in **`title`**.
- **Fix (post 5576, widget `5c3b382b`):** Set `title` to empty and moved the full `Welcome, [elementor-tag …]!` string into **`settings.__dynamic__.title`**. Cleared Elementor cache for **5576**.

### 2026-04 — Header “FREE extension” CTA not visibly blinking (fix attempt)

- **Cause:** CSS targeted `.elementor-button-wrapper .elementor-button` only; Theme Builder header button **`7f1bdc1`** may render with slightly different selectors than assumed.
- **Fix (Hello global CSS post 6064):** Broadened selectors to include `.elementor-widget-button`, direct `a.elementor-button`, and **`!important`** on the animation. Hero duplicate **`eb0b235`** included.

### 2026-04 — User welcome heading: show real first name

- **Symptom:** Heading showed literal `[user_first_name]`.
- **Cause:** Elementor **Heading** widget stored static text; no shortcode or Dynamic Tag.
- **Fix:** Replaced title with **Elementor Pro Dynamic Tag** `user-info` → **First name**, with fallback text `there`, on published **“03. User Welcome Page”** (post ID **5576**), widget id **`5c3b382b`**.
- **Cache:** Cleared Elementor cache meta for post **5576** (`_elementor_element_cache`, `_elementor_css`).

### 2026-04 — Homepage (`wrrapd.com` front page)

- **Post ID:** **4857** (Elementor document for main homepage).
- **Gift wrap strip:** Relocated from large HTML widget **`1ffb475`** to a new HTML widget **`b4e91c2`** under section **`3b1e47e`**, ordered **above** “How it works” (after divider **`5601b5d`**, before text widget **`d0991cd`**). Single DOM id **`giftWrapRow`** preserved.
- **How it works:** Step rows live in Elementor HTML widget **`e7baa0c`**. **Step 4** (Limited Agency / T&C modal, image `wrrapd-howto-003.jpg`) **removed**; steps renumbered to **five**; `aria-label` updated to “five steps”; `is-flip` alternation corrected.
- **Hello Elementor — Additional CSS** (custom post / snippet store used as global CSS, post ID **6064** in production):
  - CTA “blink” animation for header **`7f1bdc1`** and hero **`eb0b235`**.
  - How-it-works image hover zoom and pop-out (`scale`, `z-index`, shadow).
  - Various layout helpers (ticker, mobile gift row, etc.—see live CSS on **6064**).

### Earlier / ongoing

- **MCP / AI Engine:** Production WP exposes an MCP HTTP bridge for authorized maintenance (DB queries, selective updates). Treat tokens as **secrets**; rotate if leaked.
- **BetterDocs, Elementor Pro, WPCode, etc.:** Active plugin list is in `dfy_options.active_plugins` on production; do not duplicate here—query when debugging.

---

## How to record a new edit

1. Note **WP post ID** (and Elementor widget id if applicable).
2. Note whether **Hello global CSS** post **6064** (or successor) was touched.
3. If you changed PHP, mu-plugins, or `functions.php`, say **where deployed** (FTP path / hosting panel)—those are **not** in this monorepo unless copied here on purpose.

---

## Related documents

- [`FIND-WORDPRESS-ORDERS-PAGE.md`](FIND-WORDPRESS-ORDERS-PAGE.md) — SQL + admin steps to locate the rich “orders” Elementor page (not stored in Git).
- [`INTEGRATION-MAP.md`](INTEGRATION-MAP.md) — how WP fits with extension and APIs.
- [`CUSTOMER-ACCOUNTS-AND-ORDER-HISTORY.md`](CUSTOMER-ACCOUNTS-AND-ORDER-HISTORY.md) — next: wiring “Review Wrrapd Orders” to real data.
