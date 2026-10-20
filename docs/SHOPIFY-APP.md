# Shopify app — Wrrapd Gift Wrap & Delivery

**Developer:** Wrrapd Inc. (no personal names on Partner account, listing, or support fields)  
**Partner login:** admin@wrrapd.com  
**Public support:** help@wrrapd.com  
**Address:** 7901 4th St N, Ste 300, St. Petersburg, FL 33702, United States  

Merchants install a free Shopify app. Shoppers opt into gift wrap at cart/checkout; merchandise ships to the Wrrapd hub; Wrrapd wraps and delivers. Merchants do **not** wrap in-house.

## Code locations

| Piece | Path |
|---|---|
| Shopify Remix app + extensions | [`shopify-app/`](../shopify-app/) |
| Partner signup (stealth) | [`shopify-app/docs/PARTNER-SIGNUP.md`](../shopify-app/docs/PARTNER-SIGNUP.md) |
| Build plan / phases | [`shopify-app/docs/BUILD-PLAN.md`](../shopify-app/docs/BUILD-PLAN.md) |
| App Store listing copy | [`shopify-app/docs/APP-STORE-LISTING.md`](../shopify-app/docs/APP-STORE-LISTING.md) |
| Normalize Shopify → ingest | [`backend/.../lib/shopify-orders.js`](../backend/wrrapd-api-repo/WrrapdServer/lib/shopify-orders.js) |
| HTTP entry | `POST https://api.wrrapd.com/api/shopify/orders` |
| Command Center retailer | `"Shopify"` in `tracking-platform` ingest (`OrderRetailer`) |
| Order code prefix | `SH` (`extension-config` `retailerCodes.shopify`) |

## Runtime flow

```
Shopify cart / checkout UI extensions
  → cart attributes (_wrrapd_wrap, _wrrapd_giftee_zip, …)
  → orders/paid webhook (HMAC via Shopify)
  → shopify-app /webhooks
  → POST api.wrrapd.com/api/shopify/orders
       Header: X-Wrrapd-Shopify-Secret
  → Command Center ingest (retailer: Shopify)
```

Hub selection reuses `GET /api/delivery-hub?postalCode=` (same as the Chrome extension).

## Secrets (never commit)

| Variable | Where | Purpose |
|---|---|---|
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | `shopify-app/.env` | Partner OAuth |
| `SHOPIFY_APP_URL` | `shopify-app/.env` | Embedded app URL / tunnel |
| `SHOPIFY_WRRAPD_WEBHOOK_SECRET` | **both** `shopify-app/.env` and `WrrapdServer/.env` | Shared secret app → pay server |
| `INGEST_API_KEY` | WrrapdServer (existing) | Pay server → Cloud Run tracking |

Generate a long random secret once, e.g.:

```bash
openssl rand -hex 32
```

Put the same value in both `.env` files as `SHOPIFY_WRRAPD_WEBHOOK_SECRET=…`.

## Deploy when this work changes

1. **VM push** (already the normal step 2 in [DEPLOYMENT.md](../DEPLOYMENT.md)).
2. **PM2** — required when `lib/shopify-orders.js` or `server.js` Shopify route changed: restart `wrrapd-server` (DEPLOYMENT step 3). Ensure `SHOPIFY_WRRAPD_WEBHOOK_SECRET` is in the server `.env` **before** restart.
3. **Cloud Run** — required when `tracking-platform` gained `Shopify` as `OrderRetailer` (first ship of this feature, and any later ingest changes).
4. **Shopify app host** — run / deploy the Remix app (`shopify app deploy` or your hosting) after Partner app credentials are linked. Not hosted by PM2 today; see `shopify-app/README.md`.
5. **Chrome extension** — **no** rebuild for Shopify-only work.

## Stealth / copy rules

- Developer name and every App Store / Partner field: **Wrrapd Inc.** only.
- Support email: **help@wrrapd.com** (Partner signup uses **admin@wrrapd.com**).
- No contractor pay, hourly rates, or hiring language in the listing or merchant UI.
- Customer-facing strings stay short (same rules as `.cursor/rules/customer-facing-copy.mdc`).

## Tests

```bash
cd /home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer
node --test test/shopify-orders.test.js
```

## Getting orders/paid + wrap opt-in live (dev store)

Protected Customer Data (PCD) must be **approved** for the app (dev store is enough to start). Then:

1. **Webhooks in `shopify.app.toml`** — `orders/paid` plus compliance topics (`customers/data_request`, `customers/redact`, `shop/redact`). Deploy with `npx shopify app deploy --version …`.
2. **App host URL** — Cloud Run service `wrrapd-shopify` (permanent `*.run.app` URL). Set Partner **App URL** + `SHOPIFY_APP_URL` to that URL; `application_url` / `redirect_urls` update on deploy.
3. **Privacy + ingest on api.wrrapd.com** — `POST /api/shopify/orders` and `POST /api/shopify/privacy` (shared `SHOPIFY_WRRAPD_WEBHOOK_SECRET`). Privacy forwards into Command Center `/api/internal/shopify-privacy`.
4. **Wrap opt-in on the storefront**
   - **Checkout:** enable the **Wrrapd gift wrap** checkout UI extension in **Settings → Checkout → Customize** (block: Gift wrap & deliver with Wrrapd). Sets `_wrrapd_wrap=1` + giftee zip / message attributes.
   - **Cart (optional):** theme app block **Wrrapd gift wrap** on the cart template (needs theme editor access; storefront password OK).
5. **Retention (Shopify only)** — Cloud Scheduler monthly job hits tracking `POST /api/cron/shopify-recipient-retention`. It anonymizes recipient PII **only** on orders with `retailer === "Shopify"` delivered 12+ months ago.

### Hard boundary (do not blur)

Shopify privacy webhooks, redaction, and the 12‑month retention job apply **only** to the Shopify app channel (`retailer: "Shopify"` / `SH-…` ingest). They do **not** apply to:

- Chrome extension checkouts (Amazon and other retailers)
- wrrapd.com / `/buy` / pay.wrrapd.com website orders
- Any other Command Center order whose `retailer` is not `"Shopify"`

We keep full operational data from extension and website flows under our own policies. Shopify’s PCD / privacy addendum obligations are scoped to Shopify-sourced records only.

## Status — PARKED (2026-10-20)

**Tabled.** Shoppers order through Wrrapd (Chrome extension / website), not Shopify checkout enhancements. Explore again only if product strategy changes.

| Control | State |
|---|---|
| `npx shopify app dev` | Stopped |
| Cloud Run `wrrapd-shopify` | Ingress **internal**, min instances 0 |
| Scheduler `wrrapd-shopify-recipient-retention` | **PAUSED** |
| Pay routes `/api/shopify/*` | Off unless `SHOPIFY_CHANNEL_ENABLED=1` |
| Chrome extension / wrrapd.com / `/buy` | Untouched by this channel |

Code stays under `shopify-app/` + siloed pay/tracking helpers for a future revisit. Do **not** wire Shopify into the extension checkout path.
