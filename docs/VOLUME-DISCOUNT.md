# Volume discounting (multi-item wrap base)

Membership discount is **not** implemented. This file is the editor / agent note for the wrap-base volume discount that ships with extension **3.0.14**.

Live CWS (Oct 8): **3.0.14**, item `lobngnjcjeimefihnobdmocicopikoip`.

## Turn it on

1. Command Center → **Checkout pricing** → **Volume Discounting**.
2. Fill the three whole-percent boxes (0–99) with **%** beside each:
   - **2**
   - **3 to 9**
   - **10+**
3. Click **Save** in that section. The server rejects a save unless **10+ ≥ 3 to 9 ≥ 2**.
4. Defaults are **0 / 0 / 0** (no shopper discount). A later working set can be **10 / 15 / 15**.
5. New rates apply on the next checkout pricing refresh (extension caches prices about 5 minutes). Restart `wrrapd-server` after code deploys; you do **not** need a restart just to save rates.

## Shopper rules

| Wrapped units in this Pay Wrrapd checkout | Discount on the gift-wrap **base** only |
|---|---|
| 1 | none |
| 2 | the **2** percent |
| 3–9 | the **3 to 9** percent |
| 10+ | the **10+** percent |

- Two of the same product count as two units.
- AI design, upload design, flowers, and the loose-item box charge stay full price.
- Discount is **pre-tax**. Example: 2 × $6.99 = **$13.98** on Gift-wrapping, then **Multi-item base discount** **-$1.40** (10% of $13.98, rounded to the cent). Tax uses the amount after that line.
- **Do not** show a discount line when the amount is $0 (single item, or all rates 0).
- If one more wrap would raise the percent, show: *Gift-wrap another item to get a x% discount!* (typical when wrapping 1, 2, or 9, if the next tier is higher).

The retailer order number is **not** known before the Wrrapd Payment Summary. The count is wrapped units in this checkout; they already share one giftee ZIP.

## Orders after pay

- **wrrapd.com Your orders:** items on the left, **combined** payment summary on the right — keep the discount combined there.
- **Command Center → Orders → detail:** items listed separately — each wrap gets its share of the discount (`wrapBaseCents` / `wrapDiscountCents`).

## Code map

| Piece | Path |
|---|---|
| Rate math (keep identical) | `backend/wrrapd-api-repo/WrrapdServer/lib/volume-discount.js` and `extension/src/shared/volume-discount.js` |
| Charge of record | `WrrapdServer/lib/wrrapd-pricing.js` (`multiItemDiscountAware` on `pricingCart`) |
| Admin save | `PUT /api/admin/volume-discount`; preview rates on `GET /api/pricing-preview` → `volumeDiscount` |
| Config | `WrrapdServer/data/wrrapd-pricing-config.json` → `volumeDiscount` |
| Command Center UI | `tracking-platform/src/components/admin-pricing-editor.tsx` |
| Payment summary rows | `extension/src/shared/wrrapd-invoice-lines.js` (label **Multi-item base discount**) |
| Shopper receipt | `wordpress/wrrapd-orders-bridge.php` (`WRPD_MULTI_ITEM_DISCOUNT`) |

## Deploy

Pay server (this VM): `pm2 restart wrrapd-server`. Command Center: Cloud Run image for `tracking-platform`. Extension: Windows pull + `npm run build` + Chrome Reload, then CWS zip from `npm run build:store`. Upload that zip to the **live 3.0.13 listing** (`ofokdnajfbjmpbeocibingpiadnoccfc`), not the older 3.0.12 item. Shopper orders MU: copy `wrrapd-orders-bridge.php` to SiteGround `mu-plugins/` (CWS id `lobngnjcjeimefihnobdmocicopikoip`, `$latest_version` **3.0.14**) and purge W3 cache.
