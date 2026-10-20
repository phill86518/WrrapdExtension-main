# Wrrapd Shopify app — build plan

**Developer:** Wrrapd Inc.  
**Partner login:** admin@wrrapd.com  
**Support (public):** help@wrrapd.com  

Goal: merchants install one app; shoppers opt into real gift wrap + local delivery. Merchandise ships to the Wrrapd hub; Wrrapd wraps and delivers to the giftee. Unlike Huewrap-style apps, the merchant does not wrap in-house.

## What we reuse from the Chrome extension / pay server

| Capability | Existing source | Shopify use |
|---|---|---|
| Hub ship-to by giftee ZIP | `GET /api/delivery-hub` | Checkout sets merchant ship-to = hub; giftee address stored as order attributes |
| Occasions + retailer codes | `GET /api/extension-config` | Checkout occasion picker; order code prefix `SH` |
| Unit prices + tax | `GET /api/pricing-preview` | Quote wrap / flowers / custom design for the giftee ZIP |
| Gift-box fee | `POST /api/gift-box-quote` | Loose items on Shopify lines |
| AI / upload designs | `/generate-ideas`, `/api/get-upload-url`, `/api/save-ai-design` | Hosted gift-design step (pay.wrrapd.com or app proxy) |
| Command Center ingest | `process-payment` → tracking ingest | `POST /api/shopify/orders` normalizes Shopify webhooks into the same ingest shape with `retailer: "Shopify"` |
| Allowed ZIPs | `GET /api/allowed-zip-codes` | Disable wrap CTA when giftee ZIP is outside service |

## Architecture

```
Shopify store (theme + checkout UI extensions)
    │  shopper picks wrap / paper / note / flowers / design
    │  ship-to overwritten to Wrrapd hub for wrapped items
    ▼
Shopify Admin API + webhooks (orders/create, orders/paid)
    ▼
shopify-app (this package) — OAuth, settings, webhook verify
    ▼
api.wrrapd.com  POST /api/shopify/orders
    ▼
Command Center ingest (same pipeline as extension pay)
```

### Merchant-facing (embedded admin)

- Toggle: offer Wrrapd gift wrap on this store.
- Default: wrap fee paid by shopper to Wrrapd (recommended) vs. merchant-collected (later).
- Hub shipping label shown for staff (read-only from `/api/delivery-hub`).
- Link to Wrrapd Inc. support: help@wrrapd.com.

### Shopper-facing

1. **Cart** (theme app block): “Gift wrap & deliver with Wrrapd” checkbox + short explanation.
2. **Checkout UI extension**: giftee ZIP, occasion, gift message, paper / custom design, flowers; locks ship-to to hub when wrap is on.
3. **Design step**: deep-link to Wrrapd design flow (same GCS upload / AI path as extension), return token stored on the cart attribute.
4. **Payment**: wrap fee via Wrrapd Helcim checkout (same `/checkout` stack) *or* Shopify line item “Wrrapd gift wrap” that the app reconciles — Phase 1 uses Wrrapd checkout after thank-you / order status for wrap fees so merchant settlement stays simple.

### Ops-facing

- Webhook → `/api/shopify/orders` → tracking ingest with `retailer: "Shopify"`.
- `sourceNote` includes shop domain + Shopify order name.
- Hub stamped from giftee ZIP (same as extension).

## Phases

### Phase 0 — Partner + listing (now)

- [x] Partner signup guide ([PARTNER-SIGNUP.md](./PARTNER-SIGNUP.md))
- [x] App Store listing copy ([APP-STORE-LISTING.md](./APP-STORE-LISTING.md))
- [x] Repo scaffold (`shopify-app/`)
- [ ] Create Partner org with admin@wrrapd.com
- [ ] `shopify app config link` to this folder

### Phase 1 — MVP (pilot store)

1. OAuth install + offline session storage (SQLite/Prisma in app; Postgres later).
2. Merchant settings page (enable wrap, support link).
3. Checkout UI extension: wrap yes/no, giftee ZIP, message, occasion.
4. On wrap: set shipping address attributes + cart attributes (`_wrrapd_wrap`, `_wrrapd_giftee_zip`, etc.).
5. `orders/paid` webhook → verify HMAC → POST api.wrrapd.com `/api/shopify/orders`.
6. Pay server builds ingest payload (`retailer: Shopify`) and opens Command Center order.
7. Staff gets hub ship-to instructions in order note / packing slip metafield.

### Phase 2 — Parity with extension

- Paper catalog, custom upload, AI design, flowers catalog, multi-item wrap discount, gift-box fee, sales tax on wrap fee.
- Thank-you / order-status page extension to collect Wrrapd wrap payment if not charged at checkout.
- Delivery date → Wrrapd +1 scheduling (same non-Amazon path).

### Phase 3 — App Store

- Privacy, GDPR webhooks, uninstall cleanup.
- Screenshots + demo video.
- Submit for Shopify review (typically 1–2 weeks).
- Pricing: **Free** for merchants (Wrrapd earns on wrap service to shoppers).

## Scopes (minimum)

```
read_products, write_products
read_orders, write_orders
read_shipping, write_shipping
read_checkouts, write_checkouts
write_order_edits
```

Checkout UI extensions need the Checkout Extensibility channel (Shopify Plus or checkout extensibility–enabled plans as Shopify requires at submit time).

## Environment

| Var | Where | Purpose |
|---|---|---|
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | shopify-app | OAuth |
| `SCOPES` | shopify-app | Above scopes |
| `WRRAPD_API_BASE` | shopify-app | `https://api.wrrapd.com` |
| `SHOPIFY_WRRAPD_WEBHOOK_SECRET` | WrrapdServer | Shared secret app → pay server |
| `INGEST_API_KEY` | WrrapdServer | Existing Command Center ingest |

## Review notes for Shopify

- Single purpose: gift wrap + delivery fulfillment handoff to Wrrapd.
- No scraping of other merchants; only the installing shop’s data.
- Support: help@wrrapd.com · Wrrapd Inc., 7901 4th St N, Ste 300, St. Petersburg, FL 33702.
- Developer name everywhere: **Wrrapd Inc.** only.

## Out of scope for v1

- Replacing the Chrome extension on Amazon/Target/etc.
- Publishing contractor pay or internal ops rates anywhere in the app or listing.
- Multi-hub merchant picker (server already picks hub by giftee ZIP).
