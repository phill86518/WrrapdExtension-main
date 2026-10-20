# Wrrapd Gift Wrap & Delivery (Shopify)

Shopify app for **Wrrapd Inc.** Merchants offer gift wrap at checkout; merchandise ships to the Wrrapd hub; Wrrapd wraps and delivers.

| | |
|---|---|
| Developer | Wrrapd Inc. |
| Partner account | admin@wrrapd.com |
| Public support | help@wrrapd.com |
| Address | 7901 4th St N, Ste 300, St. Petersburg, FL 33702 |

## Docs

- [Partner signup](docs/PARTNER-SIGNUP.md)
- [Build plan](docs/BUILD-PLAN.md)
- [App Store listing](docs/APP-STORE-LISTING.md)

## Local / Partner CLI

Prerequisites: Node 20+, [Shopify CLI](https://shopify.dev/docs/api/shopify-cli), Partner org under Wrrapd Inc.

```bash
cd /home/phill/wrrapd-GCP/shopify-app
cp .env.example .env
# Fill SHOPIFY_API_KEY / SHOPIFY_API_SECRET from Partner Dashboard
npm install
npx shopify app config link   # once — link to the Partner app
npx shopify app dev
```

Pay-server webhook target (production): `https://api.wrrapd.com/api/shopify/orders`  
Shared secret: `SHOPIFY_WRRAPD_WEBHOOK_SECRET` (same value in app `.env` and WrrapdServer `.env`).

## Layout

```
app/                 Remix embedded admin + webhooks
extensions/
  gift-wrap-checkout/  Checkout UI extension
  gift-wrap-cart/      Theme app block (cart)
docs/                Partner, listing, build plan
```

Backend ingest lives in `backend/wrrapd-api-repo/WrrapdServer` (`lib/shopify-orders.js`, `POST /api/shopify/orders`).

## Stealth

Every merchant- and App Store–visible string must say **Wrrapd Inc.** only — never a personal name.
