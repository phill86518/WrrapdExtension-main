# WordPress bridge — claim + “Review Wrrapd Orders”

This folder is **not** loaded by WordPress automatically. Copy **`wrrapd-orders-bridge.php`** into your site’s **`wp-content/mu-plugins/`** directory (create `mu-plugins` if it does not exist). Must-use plugins run on every request and cannot be disabled from the admin UI.

## `wp-config.php`

Use the **same** secret string as **`WRRAPD_INTERNAL_CLAIM_SECRET`** on the pay server (`WrrapdServer` `.env` on the GCP VM). Never commit real values to Git.

```php
define( 'WRRAPD_API_BASE', 'https://api.wrrapd.com' );
define( 'WRRAPD_INTERNAL_API_KEY', 'paste-the-same-secret-as-WRRAPD_INTERNAL_CLAIM_SECRET' );
```

## Elementor / “Review Wrrapd Orders” page

1. Edit the page that the **Review Wrrapd Orders** button opens (logged-in users only).
2. Add a **Shortcode** widget (or HTML widget) with:

```text
[wrrapd_review_orders]
```

3. Publish. The shortcode **re-runs claim** (idempotent) then **lists** every pay-server order whose **gifter email** matches the logged-in user’s WordPress email, or that is already **claimed** to their WP user id.

Your existing per-order fields (giftee name, occasion date, etc.) stay in WordPress / Elementor as you already built them; this table is the **server-side order list** from `api.wrrapd.com`.

## After deploy

- **VM:** `pm2 restart wrrapd-server` after pulling the commit that adds **`POST /api/internal/orders-for-wp-user`**.
- **WP:** Upload the MU plugin + `wp-config.php` defines, then open the Review page while logged in.
