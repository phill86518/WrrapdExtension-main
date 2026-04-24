# WordPress bridge — claim + “Review Wrrapd Orders”

This folder is **not** loaded by WordPress automatically. Copy **`wrrapd-orders-bridge.php`** into your site’s **`wp-content/mu-plugins/`** directory (create `mu-plugins` if it does not exist). Must-use plugins run on every request and cannot be disabled from the admin UI.

## `wp-config.php`

Use the **same** secret string as **`WRRAPD_INTERNAL_CLAIM_SECRET`** on the pay server (`WrrapdServer` `.env` on the GCP VM). Never commit real values to Git.

```php
define( 'WRRAPD_API_BASE', 'https://api.wrrapd.com' );
define( 'WRRAPD_INTERNAL_API_KEY', 'paste-the-same-secret-as-WRRAPD_INTERNAL_CLAIM_SECRET' );
```

## Elementor / “Review Wrrapd Orders” page

The `[wrrapd_review_orders]` shortcode **only outputs the table block you add**; it does not remove other Elementor widgets. If you had a richer “My orders” layout (dates, giftee, occasions, design, comments), use **that** page: add one **Shortcode** widget (or embed the shortcode inside a column) and keep your existing form/list widgets. A separate minimal **“My Orders”** page is optional.

1. Edit the page that should show pay-server orders (logged-in users only — the one with your full layout if you prefer).
2. Add a **Shortcode** widget with either:

```text
[wrrapd_review_orders]
```

or a **card layout** (recommended on restored Elementor pages — navy/gold styling, **occasion dropdown** filter built from your real orders):

```text
[wrrapd_review_orders layout="cards"]
```

**Important:** If you still see columns named **“Associated Id”**, **“No. of Files”**, etc., that is **not** this shortcode — it is almost always **JetEngine (or similar) listing** reading old WordPress/CPT data. **Delete that listing widget** (or its section) in Elementor **Navigator**, then keep only **one** Shortcode widget with `layout="cards"` (or `rich` if you prefer a table). Two widgets = two different data sources on top of each other.

Older table layout:

```text
[wrrapd_review_orders layout="rich"]
```

Hide or remove any old widget that still says **“No order files found”** (that text is not from this bridge; it is usually a separate listing or custom HTML that expected files elsewhere).

### Page titles like `07. Privacy Policy` (sort prefix)

Keep the **full** title in **Pages → Edit** (with `07.` for ordering). On the **public site**, the MU plugin strips a leading **`digits + dot + spaces`** prefix from:

- headings/widgets that use `the_title`,
- the **browser tab** title (`document_title_parts`),
- **menu labels** for normal page/post menu items.

**wp-admin** lists and the editor still show the full title including `07.`

Re-upload **`wrrapd-orders-bridge.php`** after pulling the latest from GitHub.

3. Publish. The shortcode **re-runs claim** (idempotent) then **lists** every pay-server order whose **gifter email** matches the logged-in user’s WordPress email, or that is already **claimed** to their WP user id.

If you are unsure which page has the big layout: **WP Admin → Pages** and search titles/slugs for *order*, *review*, *gift*, or open **Elementor → Templates** / **Theme Builder** for user dashboards. Those page IDs are not stored in this Git repo (they live in the production DB).

### Slower homepage / header CTA blink

See **[../docs/wordpress-snippets/wrrapd-slower-cta-blink.css](../docs/wordpress-snippets/wrrapd-slower-cta-blink.css)** — append to your global Hello / Elementor Custom CSS (or merge durations into your existing `@keyframes` / `animation` rules). Remove or override older faster rules if both apply.

## After deploy

- **VM:** `pm2 restart wrrapd-server` after pulling the commit that adds **`POST /api/internal/orders-for-wp-user`**.
- **WP:** Upload the MU plugin + `wp-config.php` defines, then open the Review page while logged in.
