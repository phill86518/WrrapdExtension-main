# Wrrapd brand icon (canonical)

**Canonical mark:** `favicon/icon-focus-512.png` — red **W** with gold bow, **centered and grounded** (not floating).

All sizes in `favicon/` (`icon-16.png` … `icon-2048.png`, `favicon.ico`) are derived from that file. Do **not** reintroduce the older floating-W pack.

**Live path:** `wp-content/mu-plugins/icons/favicon/` on SiteGround (shopper + hire).

Shopper tabs: `wrrapd_brand_favicon_url()` in `wrrapd-orders-bridge.php`.  
Hire portals: `wrrapd_wrapstars_output_favicon()` / `wrrapd_wrapstars_brand_icon_url()`.

WordPress Site Icon (Appearance → Customize): prefer the Media Library upload `wrrapd-bow-favicon-180.png` regenerated from `icon-focus-512.png`.

Career role marks (`GiftWrap_001`, `DeliveryIcon_001`, `HybridRole_001`) are separate — not brand favicons.

**X / Open Graph (1200×630):** role cards `og/wrapstar-og.jpg`, `og/joyrider-og.jpg`, `og/wraprider-og.jpg` plus shopper cards `og/wrrapd-share-home-20261022.jpg`, `wrrapd-share-buy-20261022.jpg`, `wrrapd-share-blog-20261022.jpg`, and `wrrapd-share-essay-*-20261022.jpg`. Role cards are served at `https://api.wrrapd.com/img/og/`. Shopper cards are also in the WP Media Library under `uploads/2026/10/`. Path routing and bot rules: **`docs/SOCIAL-SHARE-CARDS.md`** and MU `wordpress/wrrapd-x-card-force.php`.
