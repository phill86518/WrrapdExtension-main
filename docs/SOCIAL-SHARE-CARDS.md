# Social share cards (X / Facebook / LinkedIn / Slack)

**Last updated:** 2026-10-22 (Eastern)  
**Owner path:** GCP VM `/home/phill/wrrapd-GCP` → push to GitHub → paste MU files on SiteGround.

**Live MU build:** `wrrapd-x-card-force.php` **v2.4.0** — response header `X-Wrrapd-Card: force-13`.

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

1. **`noindex`** — X and Meta often **refuse** to build a preview if the HTML has `robots` = `noindex`. `/buy/` stays noindex for Google (counsel); social bots must see an indexable robots line (force-13 clean doc uses `max-image-preview:large` only).
2. **Stale edge cache** — SiteGround proxy can serve cached **human** HTML to Twitterbot (full page, no `X-Wrrapd-Card`). Flush Speed → Caching after MU paste. Bypass with `?nocache=1` or `?card=1` when verifying. force-13 sends `Vary: User-Agent` so human and bot responses stay in separate cache keys.
3. **Quoted whole tweet** — Put the URL **outside** quotation marks so X treats it as a link entity.
4. **Wrong host** — Hire roles are on **apply.wrrapd.com**, not `wrrapd.com/wrapstars/`.
5. **Logo-only OG** — Fallbacks that point at `Wrrapd_f-Logo-*.png` look like “just the logo” on X. Prefer **api.wrrapd.com/img/og/** JPEGs (X often fails SiteGround `/uploads/`).

---

## Canonical images (1200×630 JPEG)

Prefer **api.wrrapd.com** for every share URL X/FB will fetch.

| Use | Live URL (prefer) |
|---|---|
| Homepage / `/share/` | `https://api.wrrapd.com/img/og/wrrapd-x-joyrider-e.jpg` (same JoyRider banner) |
| `/buy/` | `https://api.wrrapd.com/img/og/wrrapd-buy-card.jpg` |
| Essay: holiday | `https://api.wrrapd.com/img/og/wrrapd-essay-holiday-card.jpg` |
| Essay: season | `https://api.wrrapd.com/img/og/wrrapd-essay-season-card.jpg` |
| Essay: ribbon | `https://api.wrrapd.com/img/og/wrrapd-essay-ribbon-card.jpg` |
| WrapStar | `https://api.wrrapd.com/img/og/wrrapd-x-wrapstar-e.jpg` |
| JoyRider | `https://api.wrrapd.com/img/og/wrrapd-x-joyrider-e.jpg` |
| WrapRider | `https://api.wrrapd.com/img/og/wrrapd-x-wraprider-e.jpg` |

Repo / pay-server bytes: `backend/wrrapd-api-repo/WrrapdServer/public/img/og/` (also mirrored under `wordpress/icons/og/` / `wordpress/images/social/` where noted). Older SiteGround `uploads/2026/10/wrrapd-share-*-20261022.jpg` copies may still exist; do not rely on them for X.

Pay-server copies (always push with this work): `backend/wrrapd-api-repo/WrrapdServer/public/img/og/`.

---

## Path → image map

### Shopper — `wrrapd.com`

| Path | Image |
|---|---|
| `/`, `/share/` | `wrrapd-x-joyrider-e.jpg` |
| `/buy/` | `wrrapd-buy-card.jpg` |
| `/holiday-gifting-season/` | essay-holiday |
| `/give-them-a-season/` | essay-season |
| `/what-belongs-under-the-ribbon/` | essay-ribbon |

### Hire — `apply.wrrapd.com` (and `pros.wrrapd.com`)

| Path | Image |
|---|---|
| `/`, `/apply/`, WrapStar flows | `wrrapd-x-wrapstar-e.jpg` |
| `/drive/`, `/joyrider/`, `/driver*` | `wrrapd-x-joyrider-e.jpg` |
| `/wraprider/` | `wrrapd-x-wraprider-e.jpg` |

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

### What `wrrapd-x-card-force` v2.4.0 / force-13 does

- **Humans:** never rewrites page HTML (no output buffering, no logo `<img src>` swaps). Optionally adds `og:image` / `twitter:image` in `wp_head` only.
- **Social bots** (Twitterbot, facebookexternalhit, LinkedIn, Slack, Discord, WhatsApp, Telegram) **or** `?card=1` / `?wrrapd_card_debug=1`: emit a **tiny clean HTML document** with a single OG/Twitter image, then `exit`. Header: `X-Wrrapd-Card: force-13`. Cache: `no-store`.
- Shopper `/share/`: bots get the home card; humans 302 to `/`.
- `Vary: User-Agent` on paths that have a card payload (avoids SiteGround serving human HTML to bots).
- W3TC: `w3tc_can_cache` false for bots and `/share`.
- Googlebot still gets `noindex` on `/buy/` via `wrrapd-buy-for-you.php` (social UAs excepted there).

### History (do not reintroduce)

| Build | Mistake |
|---|---|
| force-6…11 | Various OG / cache experiments |
| force-12 / v2.3.x | Stopped body rewrite of wordmarks → OG banners (hire headers broken) |
| **force-13 / v2.4.0** | Humans are a complete no-op for HTML; bots get clean card doc only |

---

## URLs to paste when posting (GrokBot / humans)

Prefer full `https://` links, **not** wrapped inside the only set of quotes in the post. Cache-bust once if X shows a gray card from an older fetch:

| Post about | Share this URL |
|---|---|
| Shopper brand / homepage (X) | `https://wrrapd.com/share/` (preferred) or `https://wrrapd.com/?v=x1` |
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

1. SiteGround File Manager → each site’s `mu-plugins/` → overwrite/create `wrrapd-x-card-force.php` (paste from repo or `https://api.wrrapd.com/tmp-demo/wrrapd-x-card-force.php`). Same file on **wrrapd.com** and **apply.wrrapd.com**.
2. Speed → Caching → Flush (both sites).
3. Confirm Twitterbot (bypass edge with a unique query):  
   `curl -sS -D - -A 'Twitterbot/1.0' "https://wrrapd.com/buy/?nocache=$RANDOM" | grep -iE 'x-wrrapd-card|og:image'`  
   Expect `force-13` and `api.wrrapd.com/img/og/wrrapd-buy-card.jpg`.
4. Confirm apply:  
   `curl -sS -D - -A 'Twitterbot/1.0' "https://apply.wrrapd.com/drive/?nocache=$RANDOM" | grep -iE 'x-wrrapd-card|og:image'`  
   Expect `force-13` and `wrrapd-x-joyrider-e.jpg`.
5. Confirm humans still see wordmarks (not OG banners as `<img src>`):  
   `curl -sS -A 'Mozilla/5.0' 'https://apply.wrrapd.com/drive/' | grep -c 'Applications_Wrrapd\|Wrrapd_f-Logo'` (should be &gt; 0) and zero `src="https://api.wrrapd.com/img/og/`.
6. New X post (edits do not always refetch). If gray: bump `?v=` on the URL or use `/share/` for home.

Pay server: `img/og/` is static under `WrrapdServer/public/` — no `pm2` restart required for new JPEGs once files are on disk (push + already on this VM).

---

## SEO vs social (short)

- **Google rankings:** indexable pages, titles, descriptions, sitemap, featured images. `/buy/` stays noindex on purpose.
- **Social cards:** engagement when people share. Good cards do not by themselves rank Google, but featured images + indexable essays do help search presentation.

---

## Verify header

Social bot responses should include:

`X-Wrrapd-Card: force-13`

Clean document size is ~1.5–2 KB (not the full WordPress page).

## Homepage on X — use `/share/`

Bare `https://wrrapd.com/` can scrape title/description but sometimes fails to paint the large image. For shopper brand posts on X, use:

`https://wrrapd.com/share/`

Bots get the tiny home card (`wrrapd-x-home-e.jpg`); humans redirect to `/`.

## Do not rewrite logo `<img src>` URLs

`wrrapd-x-card-force` must **only** change meta tags for humans, or emit a separate clean document for bots. Never replace `Wrrapd_f-Logo*` or `Applications_Wrrapd*` in the HTML body with share JPEGs.
