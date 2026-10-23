# Social share cards (X / Facebook / LinkedIn / Slack)

**Last updated:** 2026-10-22 (Eastern)  
**Owner path:** GCP VM `/home/phill/wrrapd-GCP` → push to GitHub → paste MU files on SiteGround.

## NEVER change the live site to make a social post

Social posts use a **banner JPEG**. Copy the image URL and paste it into the post. That is the whole job.

**Never** replace the header logo, the footer logo, or any other on-page image so a crawler or a preview will look right. **Never** rewrite `Wrrapd_f-Logo`, `cropped-Wrrapd`, or `Applications_Wrrapd` inside page HTML. That swap put a hire-landing photo in the shopper header and footer on 2026-10-22 and then took `wrrapd.com` down. It is forbidden.

JoyRider is the one to reach for first when the post is about delivery. WrapStar and WrapRider have their own banners. Paste these:

| Role | Paste this image |
|---|---|
| **JoyRider** | `https://api.wrrapd.com/img/og/wrrapd-x-joyrider-e.jpg` |
| **WrapStar** | `https://api.wrrapd.com/img/og/wrrapd-x-wrapstar-e.jpg` |
| **WrapRider** | `https://api.wrrapd.com/img/og/wrrapd-x-wraprider-e.jpg` |

Older copies of the same roles, if a post already uses them: `joyrider-og.jpg`, `wrapstar-og.jpg`, `wraprider-og.jpg` in that same `/img/og/` folder.

When someone pastes a Wrrapd URL into X, Facebook, LinkedIn, Slack, etc., the crawler reads Open Graph / Twitter Card tags and shows a large image. This doc is the source of truth for those images and the MU plugins that set the tags. The plugins may set `og:image`. They may not change what shoppers see in the header or footer.

---

## Why a card sometimes fails

1. **`noindex`** — X and Meta often **refuse** to build a preview if the HTML has `robots` = `noindex`. `/buy/` stays noindex for Google (counsel); social bots must see an indexable robots line.
2. **Stale edge cache** — SiteGround proxy can serve old HTML/images. Flush Speed → Caching after MU paste. Cache-bust image URLs with `?v=YYYYMMDDx`.
3. **Quoted whole tweet** — Put the URL **outside** quotation marks so X treats it as a link entity.
4. **Wrong host** — Hire roles are on **apply.wrrapd.com**, not `wrrapd.com/wrapstars/`.
5. **Logo-only OG** — Fallbacks that point at `Wrrapd_f-Logo-*.png` look like “just the logo” on X.

---

## Canonical images (1200×630 JPEG)

| Use | File (repo) | Live URL |
|---|---|---|
| Homepage / default shopper | `wordpress/icons/og/wrrapd-home-banner-20261022d.jpg` | `https://api.wrrapd.com/img/og/wrrapd-home-banner-20261022d.jpg` (prefer API — X often fails SiteGround `/uploads/` and falls back to the logo) |
| `/buy/` | `wordpress/icons/og/wrrapd-share-buy-20261022.jpg` | `https://wrrapd.com/wp-content/uploads/2026/10/wrrapd-share-buy-20261022.jpg` |
| Blog default | `wordpress/icons/og/wrrapd-share-blog-20261022.jpg` | `https://wrrapd.com/wp-content/uploads/2026/10/wrrapd-share-blog-20261022.jpg` |
| Essay: holiday | `…/wrrapd-share-essay-holiday-20261022.jpg` | same under `uploads/2026/10/` |
| Essay: season | `…/wrrapd-share-essay-season-20261022.jpg` | same |
| Essay: ribbon | `…/wrrapd-share-essay-ribbon-20261022.jpg` | same |
| WrapStar | `wordpress/icons/og/wrapstar-og.jpg` | `https://api.wrrapd.com/img/og/wrapstar-og.jpg` |
| JoyRider | `wordpress/icons/og/joyrider-og.jpg` (frame from `Wrrapd-Driver-Ad.mp4` — yellow bag + porch handoff) | `https://api.wrrapd.com/img/og/joyrider-og.jpg` |
| WrapRider | `wordpress/icons/og/wraprider-og.jpg` | `https://api.wrrapd.com/img/og/wraprider-og.jpg` |

Pay-server copies (always push with this work): `backend/wrrapd-api-repo/WrrapdServer/public/img/og/`.

Cache-bust query used in MU code: `?v=20261022d` (bump when bytes change). Shopper OG images are forced onto **api.wrrapd.com** so Twitterbot can fetch the JPEG.

---

## Path → image map

### Shopper — `wrrapd.com`

| Path | Image |
|---|---|
| `/` | share-home |
| `/buy/` | share-buy |
| `/holiday-gifting-season/` | essay-holiday (also WP featured media **7438**) |
| `/give-them-a-season/` | essay-season (featured **7439**) |
| `/what-belongs-under-the-ribbon/` | essay-ribbon (featured **7440**) |
| Other singular posts | featured image if set; else share-blog |

### Hire — `apply.wrrapd.com` (and `pros.wrrapd.com`)

| Path | Image |
|---|---|
| `/`, `/apply/`, WrapStar flows | wrapstar-og (API) |
| `/drive/`, `/joyrider/` → redirects to drive | joyrider-og (API) |
| `/wraprider/`, `/wraprider/apply/` | wraprider-og (API) |

---

## MU plugins (must be live on SiteGround)

| Repo file | Live filename | Site |
|---|---|---|
| `wordpress/wrrapd-x-card-force.php` | `wrrapd-x-card-force.php` | **wrrapd.com** and **apply.wrrapd.com** (create if missing) |
| `wordpress/wrrapd-buy-for-you.php` | `wrrapd-buy-for-you.php` | wrrapd.com only |
| `wordpress/wrrapd-sitemap-status.php` | `wrrapd-sitemap-status.php` | wrrapd.com only |

Convenience paste mirrors (same bytes as repo):  

- `https://api.wrrapd.com/tmp-demo/wrrapd-x-card-force.php`  
- `https://api.wrrapd.com/tmp-demo/wrrapd-buy-for-you.FIXED.php` → paste into **`wrrapd-buy-for-you.php`**  
- `https://api.wrrapd.com/tmp-demo/wrrapd-sitemap-status.php`

### What `wrrapd-x-card-force` does

- Emits late `og:image` / `twitter:image` for the correct path.
- Does **not** replace header, footer, or any other visible logo URL. That rewrite is removed.
- For social bot user-agents: `DONOTCACHEPAGE`, no-store headers, and **strip `noindex`** from the robots meta so X/FB will card `/buy/`.
- Googlebot still gets `noindex` on `/buy/` (filter only skipped for social UAs in `wrrapd-buy-for-you.php`).

### Related shopper MU (same deploy wave)

- `wrrapd-seasonal-campaigns.php` — do not dump hot-gifts rail on essay singles.
- `wrrapd-orders-bridge.php` — skip occasion ticker ensure on singular posts.
- `wrrapd-wrapstars.php` — portal OG URLs bump to `api…/img/og/*?v=20261022b`.

---

## URLs to paste when posting (GrokBot / humans)

Prefer full `https://` links, **not** wrapped inside the only set of quotes in the post. Cache-bust once if X shows a gray card from an older fetch:

| Post about | Share this URL |
|---|---|
| Shopper brand / homepage | `https://wrrapd.com/?v=x1` or `https://wrrapd.com/` |
| Order-through-us | `https://wrrapd.com/buy/?v=x1` |
| WrapStar hiring | `https://apply.wrrapd.com/apply/` |
| JoyRider hiring | `https://apply.wrrapd.com/drive/` |
| WrapRider hiring | `https://apply.wrrapd.com/wraprider/` |
| Holiday essay | `https://wrrapd.com/holiday-gifting-season/` |
| Season essay | `https://wrrapd.com/give-them-a-season/` |
| Ribbon essay | `https://wrrapd.com/what-belongs-under-the-ribbon/` |

Affiliate product hops stay on `https://wrrapd.com/go/…` only (existing hop rules). Do not invent city strategy in public posts unless the human authored that post.

---

## Deploy checklist (after git push from the VM)

1. SiteGround File Manager → each site’s `mu-plugins/` → overwrite/create files per table above (copy-paste contents).
2. Speed → Caching → Flush (wrrapd.com and apply.wrrapd.com).
3. Confirm Twitterbot HTML:  
   `curl -sS -A 'Twitterbot/1.0' 'https://wrrapd.com/buy/' | grep -E 'og:image|robots'`  
   Expect share-buy image and **no** `noindex` for Twitterbot.
4. Confirm apply:  
   `curl -sS -A 'Twitterbot/1.0' 'https://apply.wrrapd.com/drive/' | grep og:image`  
   Expect `api.wrrapd.com/img/og/joyrider-og.jpg`.
5. New X post (edits do not always refetch). If gray: bump `?v=` on the URL.

Pay server: `img/og/` is static under `WrrapdServer/public/` — no `pm2` restart required for new JPEGs once files are on disk (push + already on this VM).

---

## SEO vs social (short)

- **Google rankings:** indexable pages, titles, descriptions, sitemap, featured images. `/buy/` stays noindex on purpose.
- **Social cards:** engagement when people share. Good cards do not by themselves rank Google, but featured images + indexable essays do help search presentation.

---

## Verify header

Social bot responses should include:

`X-Wrrapd-Card: force-6`


## Homepage on X — use `/share/`

Bare `https://wrrapd.com/` often scrapes title/description but **never paints the large image** (X sticks on a failed image fetch and shows the gray icon). For shopper brand posts on X, use:

`https://wrrapd.com/share/`

That path serves a tiny HTML document to social bots (MU `wrrapd-x-card-force` v2.2) and redirects humans to `/`. Image: `https://api.wrrapd.com/img/og/wrrapd-x-home-e.jpg` (nginx static).

## Do not rewrite logo `<img src>` URLs

`wrrapd-x-card-force` must **only** change `og:image` / `twitter:image` meta tags. An earlier version replaced every `Wrrapd_f-Logo*.png` and `Applications_Wrrapd*` URL in the HTML body with the share JPEG, which made the apply.wrrapd.com header show the JoyRider banner instead of the wordmark. Fixed in force-12 / v2.3.1.

