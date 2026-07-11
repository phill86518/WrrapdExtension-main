# WordPress bridge — claim + “Review Wrrapd Orders”

This folder is **not** loaded by WordPress automatically. Copy **`wrrapd-orders-bridge.php`** into your site’s **`wp-content/mu-plugins/`** directory (create `mu-plugins` if it does not exist). Must-use plugins run on every request and cannot be disabled from the admin UI.

Also copy the **`logos/`** folder next to that file: **`wp-content/mu-plugins/logos/*.png`** (Ulta, LEGO, Target, Amazon wheel images). Without those PNGs, the site still works but uses favicon fallbacks.

**My Account styling** also requires **`wrrapd-account-critical.css`** in the same **`mu-plugins/`** folder (loads in the page footer so it wins over User Registration plugin CSS). Without it, `/my-account-2/` stays on the default purple avatar / blue button look even if Additional CSS is pasted.

**This monorepo workspace vs SiteGround:** Cursor/GitHub hold the **source** files under **`wordpress/`**. SiteGround is the **live** WordPress disk. Nothing updates there until you **upload** (File Manager), use **Git deploy** if SiteGround offers it, or copy by SSH. There is no automatic link unless you set one up.

## Deploy MU-plugin + logos to production (copy-paste)

**Why the site looked unchanged:** GitHub and this repo are updated, but **wrrapd.com still has the old files** until you copy them onto the WordPress host and clear cache.

**Where the files must end up on the server** (same paths your host uses for WordPress):

| On this machine (repo) | On the WordPress server |
|--------------------------|-------------------------|
| `wordpress/wrrapd-orders-bridge.php` | `wp-content/mu-plugins/wrrapd-orders-bridge.php` |
| `wordpress/wrrapd-account-critical.css` | `wp-content/mu-plugins/wrrapd-account-critical.css` |
| `wordpress/wrrapd-auth-critical.css` | `wp-content/mu-plugins/wrrapd-auth-critical.css` |
| `wordpress/wrrapd-campaigns.json` | `wp-content/mu-plugins/wrrapd-campaigns.json` |
| `wordpress/wrrapd-seasonal-campaigns.php` | `wp-content/mu-plugins/wrrapd-seasonal-campaigns.php` |
| `wordpress/wrrapd-seasonal-campaigns.css` | `wp-content/mu-plugins/wrrapd-seasonal-campaigns.css` |
| `wordpress/wrrapd-gift-wrap-popup.php` | `wp-content/mu-plugins/wrrapd-gift-wrap-popup.php` |
| `wordpress/wrrapd-gift-wrap-popup.css` | `wp-content/mu-plugins/wrrapd-gift-wrap-popup.css` |
| `wordpress/wrrapd-gift-wrap-popup.js` | `wp-content/mu-plugins/wrrapd-gift-wrap-popup.js` |
| `wordpress/logos/*.png` (amazon, target, ulta, lego, …) | `wp-content/mu-plugins/logos/` |

**Step 1 — On the WordPress server**, set `WP_ROOT` to the directory that **contains** `wp-config.php` and the folder `wp-content/` (examples: `/var/www/html`, `/home/user/public_html`, `/sites/wrrapd.com` — use whatever your host documents).

**Step 2 — Copy from a machine that has the repo** (adjust `REPO_ROOT` and `WP_ROOT`):

```bash
export REPO_ROOT=/home/phill/wrrapd-GCP
export WP_ROOT=/PASTE/YOUR/WORDPRESS/ROOT/HERE

mkdir -p "$WP_ROOT/wp-content/mu-plugins/logos"
install -m 0644 "$REPO_ROOT/wordpress/wrrapd-orders-bridge.php" "$WP_ROOT/wp-content/mu-plugins/wrrapd-orders-bridge.php"
install -m 0644 "$REPO_ROOT/wordpress/wrrapd-account-critical.css" "$WP_ROOT/wp-content/mu-plugins/wrrapd-account-critical.css"
install -m 0644 "$REPO_ROOT/wordpress/wrrapd-auth-critical.css" "$WP_ROOT/wp-content/mu-plugins/wrrapd-auth-critical.css"
install -m 0644 "$REPO_ROOT/wordpress/wrrapd-campaigns.json" "$WP_ROOT/wp-content/mu-plugins/wrrapd-campaigns.json"
install -m 0644 "$REPO_ROOT/wordpress/wrrapd-seasonal-campaigns.php" "$WP_ROOT/wp-content/mu-plugins/wrrapd-seasonal-campaigns.php"
install -m 0644 "$REPO_ROOT/wordpress/wrrapd-seasonal-campaigns.css" "$WP_ROOT/wp-content/mu-plugins/wrrapd-seasonal-campaigns.css"
install -m 0644 "$REPO_ROOT/wordpress/wrrapd-gift-wrap-popup.php" "$WP_ROOT/wp-content/mu-plugins/wrrapd-gift-wrap-popup.php"
install -m 0644 "$REPO_ROOT/wordpress/wrrapd-gift-wrap-popup.css" "$WP_ROOT/wp-content/mu-plugins/wrrapd-gift-wrap-popup.css"
install -m 0644 "$REPO_ROOT/wordpress/wrrapd-gift-wrap-popup.js" "$WP_ROOT/wp-content/mu-plugins/wrrapd-gift-wrap-popup.js"
install -m 0644 "$REPO_ROOT/wordpress/logos/amazon.png" "$REPO_ROOT/wordpress/logos/target.png" "$REPO_ROOT/wordpress/logos/ulta.png" "$REPO_ROOT/wordpress/logos/lego.png" "$WP_ROOT/wp-content/mu-plugins/logos/"
```

**Step 3 — SiteGround Site Tools → File Manager (no SSH):**

1. **Get the five files onto your computer** (pick one way):
   - **From GitHub in the browser:** open the repo **WrrapdExtension-main** → folder **`wordpress/`** → download **`wrrapd-orders-bridge.php`** and **`wrrapd-account-critical.css`** (Raw → Save As). Open **`wordpress/logos/`** and download **`amazon.png`**, **`target.png`**, **`ulta.png`**, **`lego.png`** the same way.  
   - **Or** Code / GitHub → **Download ZIP** → unzip → use the copies under **`wordpress/`** and **`wordpress/logos/`**.

2. **SiteGround:** log in → **Site** for **wrrapd.com** → **Site Tools** → **Files** → **File Manager**.

3. Open the folder where WordPress lives. For the main domain this is usually **`public_html`**. You should see **`wp-content`** and **`wp-config.php`** in that same folder (if you see `wp-content` but no `wp-config.php`, you might be one level too deep; go up until both appear).

4. Go to **`wp-content`**. If there is **no** folder named **`mu-plugins`**, create it: **New folder** → name **`mu-plugins`** (exact spelling).

5. Open **`mu-plugins`**. Create another folder: **`logos`**.

6. **Upload** (File Manager’s **File Upload** or drag-and-drop):
   - Upload **`wrrapd-orders-bridge.php`** and **`wrrapd-account-critical.css`** into **`public_html/wp-content/mu-plugins/`** (not inside `logos`).
   - Upload the **four** `.png` files into **`public_html/wp-content/mu-plugins/logos/`**.

7. After upload, confirm these paths exist:
   - `wp-content/mu-plugins/wrrapd-orders-bridge.php`
   - `wp-content/mu-plugins/wrrapd-account-critical.css`
   - `wp-content/mu-plugins/logos/amazon.png` (and the other three PNGs)

**Step 4 — Verify My Account deploy:** Log in → open **`/my-account-2/`** → **View page source** (Ctrl+U). Near the bottom you should see:
   - `id="wrrapd-account-critical-css"`
   - `<!-- 2026-06-20-account-ui-v2 -->`  
   If you see `wrrapd-account-critical.css MISSING` instead, the CSS file was not uploaded.

**Step 5 — Purge caches** so HTML and static files refresh (your stack uses **W3 Total Cache**): **WP Admin → Performance → Purge All Caches** (or equivalent). Then open the homepage in a **private window** or append `?v=1` to the URL.

**Step 6 — Quick check** in a browser (replace domain if needed):

- `https://wrrapd.com/wp-content/mu-plugins/logos/amazon.png` should return **200** and an image (not 404).

**What this does *not* change by itself:** Hero paragraphs, headings, and buttons edited in **Elementor** still live in the **database**. To change “Amazon only” marketing sentences site-wide, edit those widgets in **WP Admin → Pages → Homepage → Edit with Elementor** (or see **[../docs/WORDPRESS-SITE-EDITS-LOG.md](../docs/WORDPRESS-SITE-EDITS-LOG.md)**). The MU-plugin changes wheels + orders UI text that it outputs.

## `wp-config.php`

Use the **same** secret string as **`WRRAPD_INTERNAL_CLAIM_SECRET`** on the pay server (`WrrapdServer` `.env` on the GCP VM). Never commit real values to Git.

```php
define( 'WRRAPD_API_BASE', 'https://api.wrrapd.com' );
define( 'WRRAPD_INTERNAL_API_KEY', 'paste-the-same-secret-as-WRRAPD_INTERNAL_CLAIM_SECRET' );
```

### Affiliate hops — `/go/{slug}/` (homepage retailer wheel)

**New retailer?** Use the step-by-step checklist: **[AFFILIATE-INTEGRATION-CHECKLIST.md](./AFFILIATE-INTEGRATION-CHECKLIST.md)** (CJ, Rakuten, homepage wheel, hot gifts, top-gifting-choices, wp-config, deploy & test).

The MU plugin registers pretty links like **`https://wrrapd.com/go/etsy/`**. On each request, WordPress runs a **`template_redirect`** handler that:

1. Matches **`/go/{slug}/`** against an allow list (`ulta`, `lego`, `target`, `amazon`, `walmart`, `nordstrom`, `kohls`, `sephora`, `etsy`, `bestbuy`).
2. If **`wp-config.php`** defines the matching constant below with a non-empty value that **starts with `https://`**, the browser receives a **302** to that URL (your Impact or other network “tracking” link — commissions and attribution are handled **there** and by the retailer, not inside this plugin).
3. If the constant is missing, empty, or not valid `https`, the plugin redirects to each retailer’s **gift hub** (e.g. Amazon → `https://www.amazon.com/gp/most-gifted`, Target → gift ideas, Sephora → `https://www.sephora.com/shop/gifts`) so visitors land on gifting pages, without affiliate credit from this hop.

Optional defines (paste full URLs from your affiliate dashboard; **do not commit live tokenized URLs** to a public repo):

```php
define( 'WRRAPD_AFFILIATE_REDIRECT_ULTA', 'https://…' );
define( 'WRRAPD_AFFILIATE_REDIRECT_LEGO', 'https://…' );
define( 'WRRAPD_AFFILIATE_REDIRECT_TARGET', 'https://…' );
define( 'WRRAPD_AFFILIATE_REDIRECT_AMAZON', 'https://…' );
define( 'WRRAPD_AFFILIATE_REDIRECT_WALMART', 'https://…' );
define( 'WRRAPD_AFFILIATE_REDIRECT_NORDSTROM', 'https://…' );
define( 'WRRAPD_AFFILIATE_REDIRECT_KOHLS', 'https://…' );
define( 'WRRAPD_AFFILIATE_REDIRECT_SEPHORA', 'https://…' );
define( 'WRRAPD_AFFILIATE_REDIRECT_ETSY', 'https://click.linksynergy.com/fs-bin/click?id=b%2fdhBLlk5M0&offerid=2023405.3&subid=0&type=4' );
define( 'WRRAPD_AFFILIATE_REDIRECT_GIFTCARDS', 'https://click.linksynergy.com/fs-bin/click?id=B%2fdH8Lik5M0&offerid=2037571.9995&type=3&subid=0' );
define( 'WRRAPD_CJ_CLICK_DOMAIN', 'www.anrdoezrs.net' );
define( 'WRRAPD_CJ_PUBLISHER_SITE_ID', '100845347' );
define( 'WRRAPD_AFFILIATE_REDIRECT_BOOKSAMILLION', 'https://www.dpbolvw.net/click-101807253-13986208' );
define( 'WRRAPD_AFFILIATE_REDIRECT_RUSSELLSTOVER', 'https://www.anrdoezrs.net/click-100845347-5124217' );
define( 'WRRAPD_AFFILIATE_REDIRECT_FRESHROASTEDCOFFEE', 'https://www.anrdoezrs.net/click-100845347-5778639' );
define( 'WRRAPD_AFFILIATE_REDIRECT_ZCHOCOLAT', 'https://www.anrdoezrs.net/click-100845347-1124214' );
define( 'WRRAPD_AFFILIATE_REDIRECT_GEARUP', 'https://www.jdoqocy.com/click-101807253-17235974' );
define( 'WRRAPD_AFFILIATE_REDIRECT_BESTBUY', 'https://…' );
define( 'WRRAPD_AFFILIATE_LOG_CLICKS', true ); // optional — logs outbound /go/ hops to PHP error_log
```

**GiftCards.com (Rakuten):** paste the **text-link click URL** from your Rakuten dashboard (screenshot: `id=B/dH8Lik5M0`, `offerid=2037571.9995`, `type=3`). Product deep links use Rakuten **`/deeplink`** with merchant id **44432** (not fs-bin `type=10`). All **`/go/giftcards/`** and bare `giftcards.com` links on the site are upgraded to this hop.

**Books-A-Million & Russell Stover (CJ):** paste full **Get link** URLs from CJ (copy the exact host). For BAM on website **101807253**, use link id **13986208** (`dpbolvw.net/click-101807253-13986208`) — advertiser ids **129899** / **1298894** are expired. Russell Stover **5124217**, Fresh Roasted Coffee **5778639**, zChocolat **1124214**.

**Fresh Roasted Coffee “link isn’t currently active” (CJ):** Usually wrong **website id** / host in `WRRAPD_AFFILIATE_REDIRECT_FRESHROASTEDCOFFEE`, or a redundant `?url=` on the homepage hop. Legacy CJ partners (BAM, Russell, FRC, zChocolat) use website **`100845347`** + **`anrdoezrs.net`**; GearUP uses **`101807253`** + **`jdoqocy.com`**. In CJ → Fresh Roasted Coffee → **Get link** (Website = the property where you joined) → paste the full `href` into wp-config. Test **`https://wrrapd.com/go/freshroastedcoffee/`** in a private window (no `?to=`). Optional per-slug override: `define( 'WRRAPD_CJ_SITE_ID_FRESHROASTEDCOFFEE', '100845347' );`

**Etsy (Rakuten Advertising):** paste the **click URL** from your Rakuten dashboard (banner or text link — not the `<img>` tag). Hot-gift and wheel links use **`https://wrrapd.com/go/etsy/?to=https://www.etsy.com/listing/…`**. The plugin converts that into a Rakuten **fs-bin deep link** (`type=10` + `RD_PARM1`) using your banner’s `id` and `offerid` — do **not** treat `offerid` as the merchant `mid`. Optional **`?subid=hot-gifts-july-fourth-toys`** is forwarded to Rakuten as **`u1` / `subid`**. If deep links still fail, set **`define( 'WRRAPD_AFFILIATE_RAKUTEN_ETSY_MID', '45701' );`** (confirm mid in Rakuten’s Deep Linking tool).

**What you can and cannot track:** Rakuten reports **clicks** and **commissionable sales** in their dashboard (typically 24–72 hours after purchase). Wrrapd cannot silently see what someone bought on Etsy afterward — that is cross-site and handled by Rakuten’s cookie + Etsy’s order feed. Enable `WRRAPD_AFFILIATE_LOG_CLICKS` to log **outbound clicks only** (slug, subid, destination) in your server error log; purchases still appear only in Rakuten.

The plugin does **not** set affiliate cookies on `wrrapd.com`; the redirect chain and the network’s URL do that. Reporting (clicks, sales, payouts) lives in your **affiliate network’s portal**, not in WordPress.

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

Keep the **full** title in **Pages → Edit** (with `07.` or `13b` for ordering). On the **public site**, the MU plugin strips a leading admin sort prefix from:

- `07. Privacy Policy`, `7. My Orders` (digits + dot + optional spaces),
- `13b Register` (digits + letter + space),

from:

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

---

## WrapStars portal (`apply.wrrapd.com` + `pros.wrrapd.com`)

**Separate WordPress install** — not on `wrrapd.com`. Full copy-paste deploy: **[WRAPSTARS-DEPLOY.md](./WRAPSTARS-DEPLOY.md)**.

| Repo file | SiteGround `mu-plugins/` |
|-----------|--------------------------|
| `wrrapd-wrapstars.php` | Yes |
| `wrrapd-boldsign.php` | Yes |
| `wrrapd-wrapstars.css` | Yes |

Elementor page shortcodes: `docs/wordpress-snippets/wrrapd-wrapstars-elementor-pages.md`
