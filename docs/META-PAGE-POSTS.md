# Meta Business Page posts (`facebook.com/wrrapd`)

**Last updated:** 2026-10-22 (Eastern)

Publishing goes through the pay server Graph helper:

- `backend/wrrapd-api-repo/WrrapdServer/lib/facebook-page.js` → `publishPagePost`
- Creatives directory: `…/data/facebook-creatives/` (basename only in `image:`)
- Scheduled hiring Tue/Thu/Sat: `lib/facebook-posts.js` + `lib/facebook-scheduler.js`
- Log: `…/data/facebook-post-log.json`

Requires `FACEBOOK_POST_ENABLED=true`, `META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN` on the VM `.env` (never commit tokens).

---

## Manual batch — 2026-10-22 (X echo + images)

Five photo posts published to Page **500934213103146**:

| Internal id | Image | Facebook post id | Theme |
|---|---|---|---|
| `x-buy-20261022` | `meta-20261022-buy.jpg` | `500934213103146_122233393568652254` | Shopper `/buy` (from X) |
| `x-buy-beautifully-20261022` | `meta-20261022-home.jpg` | `500934213103146_122233393658652254` | Shopper brand (from X) |
| `x-joyrider-20261022` | `meta-20261022-joyrider.jpg` | `500934213103146_122233393754652254` | "JoyRider" hire |
| `x-wrapstar-20261022` | `meta-20261022-wrapstar.jpg` | `500934213103146_122233393856652254` | "WrapStar" hire |
| `gift-box-craft-20261022` | `meta-20261022-gift-box.jpg` | `500934213103146_122233393982652254` | Craft / patterned paper |

Canonical image copies in Git: `wordpress/images/social/`.  
Shopify listing pack (not all used on Meta — some show dollar amounts / admin UI): `wordpress/images/shopify-images/`.

### Copy rules (still in force)

- Role names in double quotes: "WrapStar", "JoyRider", "WrapRider".
- No dollar amounts, no city launch strategy on Page posts.
- Hiring: positive, one track, apply.wrrapd.com links.
- Shopper: short plain copy + wrrapd.com / `/buy`.

### Re-post later

1. Put JPEGs in `wordpress/images/social/` **and** copy into `data/facebook-creatives/`.
2. From `WrrapdServer/`: small Node script calling `publishPagePost({ message, image })` (see log `source: x-echo-manual`).
3. Or wait for the Tue/Thu/Sat scheduler (hiring creatives `wrapstar.jpg` / `joyrider.jpg` / `wraprider.jpg`).

Related: `docs/SOCIAL-SHARE-CARDS.md` (X/OG link previews), `docs/FACEBOOK-AD-IMAGES.md` (paid ad creative QA).
