# WordPress bridge — claim + “Review Wrrapd Orders”

This folder is **not** loaded by WordPress automatically. Copy **`wrrapd-orders-bridge.php`** into your site’s **`wp-content/mu-plugins/`** directory (create `mu-plugins` if it does not exist). Must-use plugins run on every request and cannot be disabled from the admin UI.

Also copy the **`logos/`** folder next to that file: **`wp-content/mu-plugins/logos/*.png`** (Ulta, LEGO, Target, Amazon wheel images). Without those PNGs, the site still works but uses favicon fallbacks.

## Deploy MU-plugin + logos to production (copy-paste)

**Why the site looked unchanged:** GitHub and this repo are updated, but **wrrapd.com still has the old files** until you copy them onto the WordPress host and clear cache.

**Where the files must end up on the server** (same paths your host uses for WordPress):

| On this machine (repo) | On the WordPress server |
|--------------------------|-------------------------|
| `wordpress/wrrapd-orders-bridge.php` | `wp-content/mu-plugins/wrrapd-orders-bridge.php` |
| `wordpress/logos/amazon.png` (and `target.png`, `ulta.png`, `lego.png`) | `wp-content/mu-plugins/logos/` |

**Step 1 — On the WordPress server**, set `WP_ROOT` to the directory that **contains** `wp-config.php` and the folder `wp-content/` (examples: `/var/www/html`, `/home/user/public_html`, `/sites/wrrapd.com` — use whatever your host documents).

**Step 2 — Copy from a machine that has the repo** (adjust `REPO_ROOT` and `WP_ROOT`):

```bash
export REPO_ROOT=/home/phill/wrrapd-GCP
export WP_ROOT=/PASTE/YOUR/WORDPRESS/ROOT/HERE

mkdir -p "$WP_ROOT/wp-content/mu-plugins/logos"
install -m 0644 "$REPO_ROOT/wordpress/wrrapd-orders-bridge.php" "$WP_ROOT/wp-content/mu-plugins/wrrapd-orders-bridge.php"
install -m 0644 "$REPO_ROOT/wordpress/logos/amazon.png" "$REPO_ROOT/wordpress/logos/target.png" "$REPO_ROOT/wordpress/logos/ulta.png" "$REPO_ROOT/wordpress/logos/lego.png" "$WP_ROOT/wp-content/mu-plugins/logos/"
```

**Step 3 — If you only have SFTP/cPanel File Manager:** upload the same paths manually (create folder `mu-plugins/logos` if needed).

**Step 4 — Purge caches** so HTML and static files refresh (your stack uses **W3 Total Cache**): **WP Admin → Performance → Purge All Caches** (or equivalent). Then open the homepage in a **private window** or append `?v=1` to the URL.

**Step 5 — Quick check** in a browser (replace domain if needed):

- `https://wrrapd.com/wp-content/mu-plugins/logos/amazon.png` should return **200** and an image (not 404).

**What this does *not* change by itself:** Hero paragraphs, headings, and buttons edited in **Elementor** still live in the **database**. To change “Amazon only” marketing sentences site-wide, edit those widgets in **WP Admin → Pages → Homepage → Edit with Elementor** (or see **[../docs/WORDPRESS-SITE-EDITS-LOG.md](../docs/WORDPRESS-SITE-EDITS-LOG.md)**). The MU-plugin changes wheels + orders UI text that it outputs.

## `wp-config.php`

Use the **same** secret string as **`WRRAPD_INTERNAL_CLAIM_SECRET`** on the pay server (`WrrapdServer` `.env` on the GCP VM). Never commit real values to Git.

```php
define( 'WRRAPD_API_BASE', 'https://api.wrrapd.com' );
define( 'WRRAPD_INTERNAL_API_KEY', 'paste-the-same-secret-as-WRRAPD_INTERNAL_CLAIM_SECRET' );
```

## Elementor / “Review Wrrapd Orders” page

The `[wrrapd_review_orders]` shortcode **only outputs the table block you add**; it does not remove other Elementor widgets. If you had a richer “My orders” layout (dates, giftee, occasions, design, comments), use **that** page: add one **Shortcode** widget (or embed the shortcode inside a column) and keep your existing form/list widgets. A separate minimal **“My Orders”** page is optional.

1. Edit the page that should show pay-server orders (logged-in users only — the one with your full layout if you prefer).
2. Add a **Shortcode** widget. Pick **one** layout:

**Recommended — “studio” layout** (single cohesive dashboard: hero, **browse-by-occasion** dropdown, mapped checkout fields, **your occasion label** select with common presets, **your notes**, save per gift row into **user meta** — then reload):

```text
[wrrapd_review_orders layout="studio"]
```

**Card layout** (lighter, no editable overlays):

```text
[wrrapd_review_orders layout="cards"]
```

**Important:** If you still see columns named **“Associated Id”**, **“No. of Files”**, etc., that is **not** this shortcode — it is almost always **JetEngine (or similar) listing** reading old WordPress/CPT data. **Delete that listing widget** (or its section) in Elementor **Navigator**, then keep **only one** Shortcode (usually `layout="studio"`).

Older compact table:

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

Re-upload **`wrrapd-orders-bridge.php`** and the **`logos/`** PNGs after pulling the latest from GitHub (see **Deploy MU-plugin + logos to production** above).

3. Publish. The shortcode **re-runs claim** (idempotent) then **lists** every pay-server order whose **gifter email** matches the logged-in user’s WordPress email, or that is already **claimed** to their WP user id.

If you are unsure which page has the big layout: **WP Admin → Pages** and search titles/slugs for *order*, *review*, *gift*, or open **Elementor → Templates** / **Theme Builder** for user dashboards. Those page IDs are not stored in this Git repo (they live in the production DB).

### Slower homepage / header CTA blink

See **[../docs/wordpress-snippets/wrrapd-slower-cta-blink.css](../docs/wordpress-snippets/wrrapd-slower-cta-blink.css)** — append to your global Hello / Elementor Custom CSS (or merge durations into your existing `@keyframes` / `animation` rules). Remove or override older faster rules if both apply.

## After deploy

- **VM:** `pm2 restart wrrapd-server` after pulling the commit that adds **`POST /api/internal/orders-for-wp-user`**.
- **WP:** Upload the MU plugin + `wp-config.php` defines, then open the Review page while logged in.
