# Find the “rich” orders page on `wrrapd.com` (SiteGround / WordPress DB)

The monorepo does **not** contain Elementor page JSON for your per-order fields (giftee, occasion, design, comments). Those live in **`dfy_posts`** and **`dfy_postmeta`** (prefix may differ if your table prefix is not `dfy_` — check **Site Tools → Site → MySQL** for the real prefix and replace `dfy_` below).

---

## 1) Quick: WordPress admin (no SQL)

- **Pages → All Pages**: open each candidate, note **“Last modified”**, use **Screen Options** to show **ID** in the list.
- **Elementor → Tools → Regenerate CSS** (optional); **Templates → Saved Templates** / **Theme Builder**: look for **Single Page**, **Popup**, or **Loop** items tied to “orders”.
- **Plugins** you might have used for repeating rows: **JetEngine**, **JetFormBuilder**, **ACF**, **Meta Box**, **Gravity Forms** — search templates named *order*, *gift*, *customer*.

---

## 2) SQL — pages whose content mentions orders / giftee / Jet / forms

Run in **SiteGround → Site → MySQL → phpMyAdmin** → your database → **SQL**.

**List page titles + IDs whose Elementor data or content looks “order-ish”:**

```sql
SELECT ID, post_title, post_name, post_status, post_modified
FROM dfy_posts
WHERE post_type IN ('page', 'elementor_library')
  AND post_status IN ('publish', 'draft', 'private')
  AND (
    post_title REGEXP 'order|gift|giftee|wrap|customer|dashboard|review'
    OR post_name REGEXP 'order|gift|my-account|dashboard|review'
  )
ORDER BY post_modified DESC;
```

**Search inside Elementor JSON (`_elementor_data`) for common widget keys:**

```sql
SELECT p.ID, p.post_title, p.post_name, p.post_status, p.post_modified
FROM dfy_posts p
INNER JOIN dfy_postmeta pm ON pm.post_id = p.ID AND pm.meta_key = '_elementor_data'
WHERE p.post_type IN ('page', 'elementor_library')
  AND p.post_status IN ('publish', 'draft', 'private')
  AND (
    pm.meta_value LIKE '%jet-listing%'
    OR pm.meta_value LIKE '%jet-form%'
    OR pm.meta_value LIKE '%formidable%'
    OR pm.meta_value LIKE '%gravityform%'
    OR pm.meta_value LIKE '%giftee%'
    OR pm.meta_value LIKE '%occasion%'
    OR pm.meta_value LIKE '%wrrapd%'
  )
ORDER BY p.post_modified DESC;
```

If `_elementor_data` is huge, phpMyAdmin may truncate results — narrow with `AND p.post_title LIKE '%Order%'` etc.

---

## 3) If the layout lived on **[My Orders]** and looks “gone” now

- **Elementor**: open that page → **History** (clock icon) → try **older revisions**.
- **WordPress**: **Pages → [My Orders] → browse revisions** (sidebar) if classic revisions are enabled.
- **Trash**: **Pages → Trash** — restore if the page was deleted.
- Adding **`[wrrapd_review_orders]`** only adds a **Shortcode** widget output; it does **not** remove other widgets unless the page was **replaced** (new template, “Apply whole page”, or deleted sections). Check **Elementor → Navigator** for collapsed sections.

---

## 4) After you find the right page ID

Record it in [`WORDPRESS-SITE-EDITS-LOG.md`](WORDPRESS-SITE-EDITS-LOG.md) under “Recent changes” so the next person (or agent) does not have to rediscover it.

Place **`[wrrapd_review_orders]`** on that page (one Shortcode widget) so pay-server orders appear **alongside** your existing rich fields.
