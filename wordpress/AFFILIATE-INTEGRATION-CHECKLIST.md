# Wrrapd affiliate integration checklist

Systematic steps to add a **new retailer** (CJ or Rakuten) so tracking works on:

- Homepage retailer wheel
- Hot gifts rail (seasonal campaigns)
- Gift-guides / homepage snippets
- **`/top-gifting-choices/`** hub
- Any Elementor HTML with bare `retailer.com` links (auto-upgraded when the domain is registered)

All outbound affiliate traffic should flow through **`https://wrrapd.com/go/{slug}/`** (optional `?to=` deep link, optional `?subid=` for reporting). The MU plugin 302s to the network click URL; the **network** sets the commission cookie — not WordPress.

---

## 0. Before you start (one-time decisions)

| Item | Rule |
|------|------|
| **Slug** | Lowercase, no spaces: `freshroastedcoffee`, `booksamillion`, `zchocolat`. Used in URLs, PHP arrays, logo filenames, wp-config constant suffixes. |
| **Network** | **CJ** → `click-{websiteId}-{advertiserId}` on your assigned host (e.g. `www.anrdoezrs.net`). **Rakuten** → `click.linksynergy.com` banner/text link from dashboard. |
| **Never mix** | GiftCards.com = **Rakuten only** (do not add to CJ advertiser map). |
| **CJ website id** | First number after `click-` in **Get link** (e.g. `100845347` for most Wrrapd partners, **`101807253`** for GearUP). **Not** the account CID. Each CJ “website” can have a **different id and click host**. |
| **CJ click domain** | Host from that link’s Get link — e.g. `www.anrdoezrs.net` (website `100845347`) or **`www.jdoqocy.com`** (website `101807253` / GearUP). `WRRAPD_CJ_CLICK_DOMAIN` applies only to legacy `tkqlhce.com` URLs; **paste the full URL from CJ** for each retailer. |
| **CJ link id vs advertiser id** | Links page URLs often use **link id** (e.g. `click-101807253-17235974`), not advertiser id `7804601`. Paste the **exact** HTML href from CJ. |
| **Deep links** | Always verify destination URLs in a browser (404 on retailer = broken hop). See §7. |

---

## 0b. CJ — dozens of links per advertiser (what to trust)

CJ’s **Links** tab for one advertiser (e.g. Books-A-Million) can show **50+ rows** — banners, text links, category promos. That is normal. **You do not add them all to wp-config.**

### What varies (and why it looks scary)

| Piece | Example | Trust it? |
|-------|---------|-----------|
| **Click host** | `jdoqocy.com`, `dpbolvw.net`, `anrdoezrs.net`, `tkqlhce.com` | Yes — CJ uses many domains; all are valid tracking hosts. |
| **Image host** | `lduhtrp.net`, `ftjcfx.com` | Ignore for setup — only the `<a href="https://…/click-…">` matters. |
| **Website id** (1st number) | `101807253` on “Wrrapd” vs `100845347` on another site property | Must match the **Website** dropdown you use for wrrapd.com in CJ. |
| **2nd number** | **Link id** (e.g. `11173806`) *or* **Advertiser id** (e.g. `1298894`) | See pick rule below. |

Examples from your BAM screenshot:

- Banner: `https://www.jdoqocy.com/click-101807253-11173806` → fixed landing (homepage-style).
- Text: `https://www.dpbolvw.net/click-101807253-14007015` → fixed landing (Educational Resources).

Different host + different link id = **different creatives**, not broken links.

### The rule: **one canonical hop per slug**

For each retailer slug (`booksamillion`, `gearup`, …) you store **exactly one** URL in wp-config:

```php
define( 'WRRAPD_AFFILIATE_REDIRECT_BOOKSAMILLION', '…paste ONE click URL here…' );
```

Every `https://wrrapd.com/go/booksamillion/` on the site uses that hop. Sitewide JS upgrades bare `booksamillion.com` links to `/go/booksamillion/?to=…` automatically.

You are **not** missing commissions by ignoring the other 49 CJ rows — those are alternate creatives for the same program.

### How to pick **which one** URL (decision tree)

**Step 1 — Website dropdown in CJ**

Before Get link / Links, select the website property tied to **wrrapd.com** (your screenshots show **Wrrapd — `101807253`**). Every click URL for that property should start with the same website id: `click-101807253-…`.

If older wp-config lines use `100845347`, that is a **different CJ website**. Pick one property for production and migrate constants to match (test after change).

**Step 2 — Do you need product deep links?** (`/go/booksamillion/?to=https://…/p/1776/…`)

| Need | Use this CJ URL type | 2nd number is… |
|------|----------------------|----------------|
| **Yes** — hot gifts, specific product pages | **Get link** from an active BAM creative that supports `?url=` (test after paste) | **Link id** `13986208` → `click-101807253-13986208` |
| **No** — only “shop at BAM” hub links | Any **homepage / general** creative from Links tab | **Link id** (e.g. `11173806`) is fine |

**Books-A-Million note (Jul 2026):** advertiser-level hops `129899` / `1298894` redirect to CJ “offer expired”. Use link id **`13986208`** (Coupon: 15% off $35 text link) — confirmed working for both hub and `?url=` product deep links.

**Step 3 — Paste and test**

1. Copy the **`href`** from Get link (not the image URL).
2. Add to wp-config (one line per retailer).
3. Test base: `https://wrrapd.com/go/booksamillion/` → CJ host → BAM site.
4. If you use hot-gift products, test: `https://wrrapd.com/go/booksamillion/?to=https://www.booksamillion.com/p/1776/David-McCullough/9780743226721` → correct book page, not CJ error.

**Step 4 — Stop**

Do not add banner #2, #3, … unless you intentionally want a **second slug** (e.g. `booksamillion-edu` for a dedicated educational landing page — rarely needed).

### GearUP vs BAM (same idea)

| Retailer | Suggested wp-config (website `101807253`) |
|----------|------------------------------------------|
| **GearUP** | `https://www.jdoqocy.com/click-101807253-17235974` (homepage link id) |
| **Books-A-Million** (hub + product `?to=`) | `https://www.dpbolvw.net/click-101807253-13986208` (link id — active coupon text link) |
| **Books-A-Million** (hub only, alternate) | `https://www.jdoqocy.com/click-101807253-11173806` (banner/home) |

Hosts may differ (`jdoqocy` vs `dpbolvw`) — **paste what CJ gives you**; the plugin no longer overwrites non-`tkqlhce.com` URLs.

### What the plugin already handles (so you don’t need 50 links)

- **`/go/{slug}/`** — one wp-config hop per slug.
- **`?to=`** — appends destination for CJ/Rakuten when the hop URL supports it.
- **Bare retailer links** anywhere on the site → upgraded to `/go/{slug}/?to=…`.
- **Multiple CJ domains** — each retailer keeps the host you pasted; only legacy `tkqlhce.com` placeholders rewrite to `WRRAPD_CJ_CLICK_DOMAIN`.

### Quick reference: your two BAM examples

| Creative | Click URL | Use for wp-config? |
|----------|-----------|-------------------|
| BAM coupon text link | `dpbolvw.net/click-101807253-**13986208**` | **Current production hop** — hub + product `?url=` deep links |
| BAM banner | `jdoqocy.com/click-101807253-**11173806**` | Alternate **homepage-only** hop |
| (Expired — do not use) | `…/click-101807253-**129899**` or `1298894` | Redirects to CJ “offer expired” |

---

## 1. Files you may need to touch (quick map)

| Priority | File | When |
|----------|------|------|
| **Required** | SiteGround `wp-config.php` | Every new tracked retailer |
| **Required** | `wordpress/wrrapd-orders-bridge.php` | Register slug + domain + network logic |
| **Homepage wheel** | Same + `wordpress/logos/{slug}.png` | Retailer appears in top logo strip |
| **Hot gifts / seasonal** | `wordpress/wrrapd-campaigns.json` | Product cards on homepage |
| **Gift guides block** | `docs/wordpress-snippets/wrrapd-gift-guides-section.html` | Logo row on homepage (Elementor) |
| **Top gifting hub** | `docs/wordpress-snippets/generate-top-gifting-page.mjs` → regenerate HTML | `/top-gifting-choices/` |
| **Top gifting hub** | `docs/wordpress-snippets/wrrapd-top-gifting-choices-page.html` | Paste into Elementor after regen |
| **Deploy** | `wordpress/README.md` (wp-config examples) | Keep copy-paste block current |
| **Optional** | `wordpress/wrrapd-seasonal-campaigns.php` | Only if gift `href` upgrade logic needs a new hostname pattern |
| **Not required for tracking** | Chrome extension repo | Extension retailers (Target, Amazon, …) are checkout partners, not CJ/Rakuten hub cards |

After code changes: upload MU files → **purge W3 cache** → confirm build tag in view-source (`WRRAPD_MU_BUILD` in `wrrapd-orders-bridge.php`).

---

## 2. wp-config.php (production — do this first)

Paste **once** (shared CJ settings):

```php
/* --- Wrrapd affiliate tracking --- */
define( 'WRRAPD_CJ_CLICK_DOMAIN', 'www.anrdoezrs.net' ); // host from CJ Get link
define( 'WRRAPD_CJ_PUBLISHER_SITE_ID', '100845347' );
```

**Per retailer** — add one line when approved:

### CJ (Commission Junction)

```php
define( 'WRRAPD_AFFILIATE_REDIRECT_BOOKSAMILLION', 'https://www.dpbolvw.net/click-101807253-13986208' );
```

Copy the **full Get link** from CJ → Advertiser → Links. Host must match `WRRAPD_CJ_CLICK_DOMAIN`.

### Rakuten Advertising

```php
define( 'WRRAPD_AFFILIATE_REDIRECT_ETSY', 'https://click.linksynergy.com/fs-bin/click?id=b%2fdhBLlk5M0&offerid=2023405.3&subid=0&type=4' );
define( 'WRRAPD_AFFILIATE_REDIRECT_GIFTCARDS', 'https://click.linksynergy.com/fs-bin/click?id=B%2fdH8Lik5M0&offerid=2037571.9995&type=3&subid=0' );
```

Optional — Rakuten **product** deep links (when `/deeplink?mid=` is required):

```php
define( 'WRRAPD_AFFILIATE_RAKUTEN_GIFTCARDS_MID', '44432' );
define( 'WRRAPD_AFFILIATE_RAKUTEN_ETSY_MID', '45701' );
```

Or rely on built-in mids in `wrrapd_affiliate_rakuten_mid_for_slug()` for known slugs (`giftcards` → `44432`, `etsy` → `45701`).

Optional debug:

```php
define( 'WRRAPD_AFFILIATE_LOG_CLICKS', true );
```

---

## 3. `wrrapd-orders-bridge.php` — PHP registration (required)

Use slug `{slug}` consistently below.

### 3a. Allow list (required)

**Function:** `wrrapd_affiliate_go_allowed_slugs()`

Add `'{slug}'` to the returned array. Without this, `/go/{slug}/` returns 404.

### 3b. wp-config constant name (required)

**Function:** `wrrapd_affiliate_go_constant_for_slug()`

```php
'{slug}' => 'WRRAPD_AFFILIATE_REDIRECT_{SLUG_UPPER}',
```

Example: `'booksamillion' => 'WRRAPD_AFFILIATE_REDIRECT_BOOKSAMILLION'`

### 3c. Public fallback URL (required)

**Function:** `wrrapd_affiliate_fallback_public_url()`

Gift-ideas landing page when no wp-config constant is set (honest non-tracked fallback):

```php
'{slug}' => 'https://www.example.com/gifts',
```

### 3d. Sitewide link upgrade — domain map (required)

**Function:** `wrrapd_affiliate_domain_slug_rules()`

- **Homepage wheel retailers** are included automatically via `wrrapd_home_retailer_wheel_brands()`.
- **CJ/Rakuten-only partners** (not on wheel): add to the `$extra` array:

```php
array( 'host' => 'example.com', 'slug' => 'example' ),
```

Also add `www.` variants if the site uses them (rules match `example.com` and subdomains).

This powers:

- Server-side HTML rewrite (`the_content`, Elementor widgets)
- Footer JS link upgrader + click capture (bare `https://example.com/...` → `/go/example/?to=...`)

### 3e. CJ advertiser id (CJ only)

**Function:** `wrrapd_affiliate_cj_advertiser_id_for_slug()`

```php
'{slug}' => '1234567',  // second number in click-100845347-1234567
```

Used when wp-config constant is missing but `WRRAPD_CJ_PUBLISHER_SITE_ID` is set.

### 3f. Rakuten merchant id (Rakuten only, product deep links)

**Function:** `wrrapd_affiliate_rakuten_mid_for_slug()`

Add to `$map` if the retailer needs `/deeplink?id=&mid=&murl=` (GiftCards, most product links):

```php
'{slug}' => '44432',
```

Find **mid** in Rakuten → Advertiser info (not the same as `offerid` on banner links).

### 3g. Deep-link hostname allowlist (optional)

**Function:** `wrrapd_affiliate_go_apply_deep_link()` → `$patterns`

Only if deep links need extra hostname validation (e.g. `zchocolat.com` + `zchocolates.com`):

```php
'{slug}' => '#^https://(www\.)?example\.com/#i',
```

### 3h. Homepage retailer wheel (optional)

**Function:** `wrrapd_home_retailer_wheel_brands()`

```php
array( 'slug' => '{slug}', 'label' => __( 'Brand', 'wrrapd' ), 'domain' => 'example.com' ),
```

Wheel links are **`/go/{slug}/`** automatically. Add logo PNG (§5).

### 3i. Bump build tag

**Constant:** `WRRAPD_MU_BUILD` at top of file — change date string after edits.

---

## 4. Homepage & seasonal content (optional per retailer)

### 4a. Hot gifts rail

**File:** `wordpress/wrrapd-campaigns.json`

Under active campaign `hot_gifts` (or `evergreen_hot_gifts`):

```json
{
  "product": "Product name",
  "title": "Product name",
  "category": "unique_category_key",
  "price_approx": 75,
  "image": "https://…",
  "href": "https://wrrapd.com/go/{slug}/?to=https://www.example.com/valid-product-path",
  "retailer": "Display Name",
  "domain": "example.com",
  "retailer_slug": "{slug}"
}
```

Rules enforced by picker:

- `hot_gifts_max_per_retailer`: 2 (default)
- `hot_gifts_min_retailers`: 4 (default)
- `"pin": true` — always include (e.g. hero SKU)

Also copy seasonal files when changed: `wrrapd-seasonal-campaigns.php`, `wrrapd-seasonal-campaigns.css`.

### 4b. Gift guides (Elementor HTML)

**File:** `docs/wordpress-snippets/wrrapd-gift-guides-section.html`

Use **`/go/`** hops only:

```html
<a class="wrrapd-gift-guides__card-logo" href="https://wrrapd.com/go/{slug}/" …>
<a class="wrrapd-gift-guides__cta" href="https://wrrapd.com/go/{slug}/" …>
```

Logo path: `https://wrrapd.com/wp-content/mu-plugins/logos/{slug}.png` with favicon `data-fallback`.

Re-paste widget in Elementor after editing.

---

## 5. Logos (homepage wheel & gift cards)

**Path:** `wordpress/logos/{slug}.png` → deploy to `wp-content/mu-plugins/logos/`

```bash
cd wordpress/logos && ./build-logos.sh   # or add PNG manually
```

Used by wheel strip, hot-gifts retailer logos, gift-guides when referenced.

---

## 6. Top Gifting Choices hub (`/top-gifting-choices/`)

### 6a. Edit generator

**File:** `docs/wordpress-snippets/generate-top-gifting-page.mjs`

1. **`FEATURED`** — active partners (top of page). Prefer explicit `/go/` in generated HTML (see current `wrrapd-top-gifting-choices-page.html` for GiftCards, Russell Stover, BAM).
2. **`categories`** — add card under the right category.
3. **`DEFAULT_GIFT_HREFS`** — stable gift-landing URL per domain (avoid 404-prone paths).
4. **`EXTENSION_RETAILERS`** — do **not** list here (Chrome extension checkout partners; link to homepage instead).
5. **`BLOCKLIST`** — declined / not a fit.

For **tracked** partners, set card `href` to hop URL in the generator’s `card()` output (recommended improvement: default `https://wrrapd.com/go/{slug}/` when slug is registered).

### 6b. Regenerate HTML

From repo root:

```bash
node docs/wordpress-snippets/generate-top-gifting-page.mjs
```

### 6c. WordPress / Elementor

1. Edit page **Top Gifting Choices** (`/top-gifting-choices/`).
2. Replace HTML widget content with `docs/wordpress-snippets/wrrapd-top-gifting-choices-page.html`.
3. CSS already in `wrrapd-additional-css-complete.css` (Additional CSS).
4. Purge cache.

Bare retailer URLs in the HTML still upgrade **if** §3d domain map includes the host.

---

## 7. Deep link URL cheat sheet (avoid 404s)

| Retailer | Good pattern | Bad pattern |
|----------|--------------|-------------|
| **GiftCards.com** | `/us/en/catalog/brands/visa-gift-cards` | `/us/en/catalog/product/custom-visa-gift-card` (404) |
| **Books-A-Million** | `/p/1776/David-McCullough/9780743226721` | `/book/978…` or `/p/1776-David-McCullough/978…` (missing author segment) |
| **Russell Stover** | `/chocolate` or `/shop/gifts` | Old SKU `.html` paths that 404 |
| **Etsy** | Full listing URL in `?to=` | Homepage only when you mean a specific listing |
| **Target / Amazon** | Full product URL from address bar | Scene7 image URLs (images only, not product pages) |

**Always:** open the `?to=` URL in an incognito tab before shipping.

---

## 8. Network-specific notes

### CJ

- Base hop: paste **one** full Get link URL per slug in wp-config (see **§0b** — ignore the other 49 creatives).
- **Website id** must match your wrrapd.com property (e.g. `101807253`); different properties → different `click-{id}-…` prefixes.
- **Hosts** (`jdoqocy`, `dpbolvw`, `anrdoezrs`, …) are all valid; paste the host CJ shows — do not normalize them all to one domain.
- Product hops: prefer **advertiser id** URLs (`click-{website}-{advertiserId}`) + `?url=` when using hot-gift `?to=` links.
- `WRRAPD_CJ_CLICK_DOMAIN` only rewrites legacy **`tkqlhce.com`** placeholders.
- Error “link isn’t currently active” → wrong website id, wrong link id, dead `url=`, or not approved.

### Rakuten

- Store hop: paste **text/banner click URL** from dashboard into wp-config
- Product hop: plugin prefers `/deeplink?id=&mid=&murl=` when `mid` is known
- **Do not** use fs-bin `type=10` for GiftCards (use mid **44432**)
- Etsy: fs-bin `type=10` + `RD_PARM1` from banner `offerid` (offerid ≠ mid)
- Error “Invalid Publisher Code…” → wrong deep-link type or bad offer/mid pairing

---

## 9. Deploy checklist (copy-paste)

**On GCP VM (repo):** commit + push when ready.

**On SiteGround:**

1. [ ] `wp-config.php` — new `define( 'WRRAPD_AFFILIATE_REDIRECT_…' )` (+ shared CJ/Rakuten lines if first time)
2. [ ] Upload `wp-content/mu-plugins/wrrapd-orders-bridge.php`
3. [ ] Upload `wp-content/mu-plugins/wrrapd-campaigns.json` (if seasonal/hot gifts changed)
4. [ ] Upload `wp-content/mu-plugins/logos/{slug}.png` (if wheel/guides use logo)
5. [ ] Elementor — gift-guides HTML / top-gifting-choices HTML if snippets changed
6. [ ] **W3 Total Cache → Purge all**
7. [ ] View-source — confirm new `WRRAPD_MU_BUILD` string

**Windows (extension only if extension code changed):** Roger’s clone → `git pull` → `npm run build` → Chrome Reload. Affiliate-only changes **skip** Windows.

---

## 10. Test checklist (per new retailer)

| # | Test | Pass criteria |
|---|------|----------------|
| 1 | Base hop | Click `/go/{slug}/` → network domain (CJ or linksynergy) → retailer homepage |
| 2 | Deep link | Click `/go/{slug}/?to=https://…product…` → network → **correct product page** (not 404) |
| 3 | Wheel | Homepage top logo → `/go/{slug}/` in address bar first |
| 4 | Hot gift | Card click → tracked hop → product/category page |
| 5 | Top gifting | Card CTA on `/top-gifting-choices/` → tracked hop |
| 6 | Bare link | Elementor link to `https://www.example.com/…` → JS upgrades to `/go/{slug}/?to=…` before navigation |
| 7 | New tab | `target="_blank"` + `rel="sponsored noopener noreferrer"` on affiliate anchors |
| 8 | Reporting | Click appears in CJ / Rakuten dashboard within network’s normal delay |

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `/go/foo/` 404 | Slug not in `wrrapd_affiliate_go_allowed_slugs()` | §3a |
| Goes straight to retailer, no network hop | Link bypasses `/go/`; domain not in §3d | Add domain map; use `/go/` in HTML |
| CJ “link isn’t currently active” | Wrong click domain or website id; dead `url=` | §2, §7; verify Get link in CJ |
| Rakuten “Invalid Publisher Code…” | fs-bin deep link on unsupported offer | Use `/deeplink` + mid (§3f) |
| GiftCards 404 on site | Bad `?to=` path | §7 — update `wrrapd-campaigns.json` href |
| BAM 404 | Wrong `/p/` path format | `/p/{title}/{author}/{isbn}` |
| Changes not visible | Cache or old MU file on server | Purge W3; confirm build tag |

---

## 12. Minimal example — new CJ partner “Example Chocolates”

**Inputs from CJ dashboard:**

- Slug: `examplechocolates`
- Domain: `examplechocolates.com`
- Advertiser id: `9999999`
- Get link: `https://www.anrdoezrs.net/click-100845347-9999999`

**Checklist:**

- [ ] wp-config: `define( 'WRRAPD_AFFILIATE_REDIRECT_EXAMPLECHOCOLATES', 'https://www.anrdoezrs.net/click-100845347-9999999' );`
- [ ] `wrrapd_affiliate_go_allowed_slugs()` → `'examplechocolates'`
- [ ] `wrrapd_affiliate_go_constant_for_slug()` → `WRRAPD_AFFILIATE_REDIRECT_EXAMPLECHOCOLATES`
- [ ] `wrrapd_affiliate_fallback_public_url()` → `https://www.examplechocolates.com/`
- [ ] `wrrapd_affiliate_domain_slug_rules()` `$extra` → `examplechocolates.com`
- [ ] `wrrapd_affiliate_cj_advertiser_id_for_slug()` → `9999999`
- [ ] (Optional) Wheel + `logos/examplechocolates.png`
- [ ] (Optional) `wrrapd-campaigns.json` hot gift entry
- [ ] (Optional) `generate-top-gifting-page.mjs` → regen → Elementor paste
- [ ] Deploy + §10 tests

---

## 13. Minimal example — new Rakuten partner

**Inputs from Rakuten dashboard:**

- Slug: `newpartner`
- Domain: `newpartner.com`
- Banner click URL: `https://click.linksynergy.com/fs-bin/click?id=…&offerid=…&type=3&subid=0`
- Merchant id (for product links): from Advertiser info → e.g. `12345`

**Checklist:**

- [ ] wp-config: `define( 'WRRAPD_AFFILIATE_REDIRECT_NEWPARTNER', '…paste click URL…' );`
- [ ] (If product deep links) `define( 'WRRAPD_AFFILIATE_RAKUTEN_NEWPARTNER_MID', '12345' );` or add to `wrrapd_affiliate_rakuten_mid_for_slug()`
- [ ] Same §3a–3d PHP registration as CJ (skip §3e CJ map)
- [ ] Deploy + test base hop and one product `?to=` URL

---

## Related docs

- `wordpress/README.md` — MU deploy paths + wp-config copy-paste block
- `DEPLOYMENT.md` — monorepo deploy sequence (VM push, pm2, Cloud Run, Windows extension)
- `docs/wordpress-snippets/wrrapd-gift-guides-section.html` — homepage gift-guide logos
- `docs/wordpress-snippets/generate-top-gifting-page.mjs` — top-gifting hub generator
