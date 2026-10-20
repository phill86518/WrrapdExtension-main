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

## Status

Scaffold + pay-server ingest + listing/Partner docs are in-repo. Partner org creation, `shopify app config link`, pilot store install, and App Store submission are still manual steps in the Partner Dashboard (see Partner signup + build plan).
