# Wrrapd Chrome extension — changelog

Every Chrome Web Store version, with every change that ships in it. Server (`api.wrrapd.com`)
and Command Center changes that the version depends on are listed under the same version.

Build for the store on Windows: `npm run build:store` → upload `extension/wrrapd-extension-store.zip`
(confirm its `manifest.json` says the version below).

---

## 3.0.14 — not yet submitted (as of Oct 7, 2026)

3.0.13 is **live** on the Chrome Web Store (item `ofokdnajfbjmpbeocibingpiadnoccfc`, published Oct 6) and does **not** contain any of this. Upload 3.0.14 to **that same listing**. The wrrapd.com install nudge stays at **3.0.13** until 3.0.14 is public.

### A. Business rules moved to the server (Oct 5 · commit `e236b2a`)

The package no longer carries its own copy of prices, the hub address, or the legal text.

| What | Before (≤ 3.0.13) | Now |
|---|---|---|
| Unit prices (wrap, custom upload, AI design, flowers) | Hard-coded fallbacks in the bundle | Only from `/api/pricing-preview`; labels show no price until the server answers |
| Hub ship-to address + phone | Constants in `wrrapd-hub.js` / LEGO `constants.js` | `GET /api/extension-config` → `hub` |
| Occasion list | In the bundle | `GET /api/extension-config` → `occasions` |
| Retailer order-number codes (AZ, TG, LG …) | In the bundle | `GET /api/extension-config` → `retailerCodes` |
| Shopper Terms & Conditions (18 clauses) | Full HTML in `wrrapd-terms.js` | `GET /api/shopper-terms?retailer=` |
| Which loose items need a gift box + box charge | Regex rules + `$` constant in `gift-box.js` | `POST /api/gift-box-quote` |
| Default sales-tax ZIP | Constant | Hub ZIP from config; server falls back to its own default rate |

- The last good config is kept in `chrome.storage.local` (extension-only storage, never the retailer page).
- Server: `lib/extension-config.js`, `lib/shopper-terms.js`, `lib/retired-extension.js`.
- Server refuses checkouts that still carry the old **PO BOX 26067** hub (extensions 3.0.10 / 3.0.11)
  with "Please install the current Wrrapd extension, then try again." — before any payment page or charge.

### B. Reliability fixes for the server move (Oct 7 · commit `4d102b8`)

- Amazon gift options wait (in parallel, briefly) for config + prices before drawing labels — no bare "$" and no empty occasion list.
- All pricing paths are null-safe when prices have not arrived (pay totals, order data, LEGO pop-up).
- Tax ZIP is read when needed, not at script load (it used to be read before config existed).
- Pay Wrrapd refuses to open with a blank hub; the shopper sees "Please refresh the page and try again." — no charge attempted.
- Giftee ZIP bar only marks the ZIP ready when prices actually loaded; otherwise "We couldn't verify that ZIP right now. Please try again."
- Gift-box check: separate answers for the same item with / without flowers; 4-second timeout.
- Sephora: dropped its own hard-coded phone (904-204-0617); uses the hub phone from the server like every other retailer.

### C. Closest delivery hub for each giftee ZIP (Oct 7)

**What changes for the shopper:** nothing visible. Retailers still ship to "WRRAPD INC" at a hub;
today the only hub is Jacksonville, so every order still goes to
**150 BUSCH DR #26067, JACKSONVILLE FL 32218**.

**How it works**

1. Shopper types the giftee ZIP in the gift modal and clicks Submit.
2. While prices load, the extension asks `GET https://api.wrrapd.com/api/delivery-hub?postalCode=<giftee ZIP>`
   in the background (the shopper does not wait for it).
3. The server picks the **closest active hub** — straight-line miles between ZIP centers
   (US Census ZIP centroids, `data/zip-centroids.json`). A ZIP with no known location gets the **default hub**.
4. Every place the extension uses the hub — Amazon address book / "add address" form, Amazon "is this the Wrrapd
   address?" checks, Target / Walmart / Best Buy / Kohl's / Nordstrom / Sephora / Ulta / Etsy / LEGO shipping-form
   fill and lock, the LEGO hub confirm box, the Pay Wrrapd hub address, and the tax-ZIP fallback — now uses that
   hub. Each of them waits for a lookup still in flight before filling anything.
5. The pick is saved per retailer site in `chrome.storage.local` for 3 days, so cart → checkout page loads keep it.
   Submitting a new giftee ZIP replaces it.
6. If the lookup fails twice, the extension uses the default hub (and drops an older pick made for a different ZIP).

**Extension files**

- `src/shared/extension-config.js` — `assignDeliveryHubForZip(zip)`, `assignedHubPostalCode()`; `extensionConfig()`
  returns the config with the assigned hub. `ensureExtensionConfig()` waits for an in-flight lookup, and if this
  tab already has a submitted giftee ZIP it re-asks the server (covers cart → checkout without remounting the ZIP bar).
- `src/shared/giftee-zip-estimate.js` — starts the hub lookup when an allowed giftee ZIP is submitted (all 10 retailers use this bar).
- `src/content/content-legacy.js` — Amazon address-step entry points (`handleWrrapdAddressSelection`,
  `selectAddressesForItemsSimple`, `selectWrrapdAddressFromDropdown`, `selectAddressFromDropdown`,
  `processAddressChangeSimple`, `trySelectWrrapdNativeSelectInRow`, `processAddressChange`, `addWrrapdAddress`)
  wait for the hub first.
- All `content*.js` bundles rebuilt.

**Server (`WrrapdServer`) — on `api.wrrapd.com` (pm2 `wrrapd-server`, Oct 7)**

- New `lib/delivery-hubs.js` + `data/delivery-hubs.json` (seeded with the Jacksonville hub, id `jax-1`, default).
  Hub fields: internal name, type (Premium PO Box with street address / PO Box / street address), ship-to name,
  address lines, city, state, ZIP, phone, notes, active.
- `GET /api/delivery-hub?postalCode=` (public, no-store; CORS already allows all 10 retailers).
- `GET /api/extension-config` → `hub` is now the **default** hub from the hub list (same fields as before + `hubId`).
- Admin (bearer `WRRAPD_ADMIN_API_KEY`): `GET /api/admin/delivery-hubs`, `POST …/upsert`, `…/remove`, `…/active`,
  `…/default`, `GET …/check?postalCode=`. The last active hub cannot be removed or paused. A hub ZIP must be in the
  ZIP location index.
- Order hand-off to Command Center: each order's note ends with `Hub: <name> (<ZIP>).` (the hub for the giftee ZIP —
  shows in Orders and the admin new-order email).
- Server "is this our warehouse address?" check (used so the hub is never mistaken for the giftee address) now
  recognizes every configured hub.
- Tests: `test/delivery-hubs.test.js` (nearest hub, default fallback, pause, last-hub guard, bad addresses, hub-address match).

**Command Center (`tracking-platform`) — Cloud Run `wrrapd-tracking` (Oct 7)**

- **Admin → Allowed ZIP codes** has a new **Delivery hubs** section under the ZIP editor: hub table (ship-to lines,
  type, how many allowed giftee ZIPs each hub serves and the farthest one), Add / Edit, Pause / Turn on,
  Make default, Remove, and "Which hub serves a giftee ZIP?" (shows miles to every hub).
- Files: `src/lib/delivery-hubs-admin.ts`, `src/components/admin-delivery-hubs.tsx`, `src/app/admin/zip-codes/page.tsx`.

**Adding a second hub later:** Command Center → Allowed ZIP codes → Delivery hubs → Add a hub. No extension release
needed — the next giftee ZIP submitted near that hub gets it. Add that metro's giftee ZIPs to the allowlist as usual.

**Known limit:** if the shopper's gift goes to a different hub than the order note says (only possible when the hub
lookup failed and the default hub was used), the package arrives at the default hub. With one hub this cannot happen.

### D. One giftee ZIP per order (Oct 7)

The first Wrrapd item's giftee ZIP locks every later Wrrapd item in the same order, so the
order has one hub, one tax rate, and one flower area.

- Later items show that ZIP read-only, with no Submit button; it is confirmed automatically.
- Target / Walmart / Best Buy / Kohl's / Nordstrom / Sephora / Ulta / Etsy and LEGO (one modal,
  "Item N of M"): item 1 is editable; items 2+ are locked. Going Back to item 1 unlocks it, and a
  new ZIP there carries to the other items.
- Amazon (one modal per item): when another item already has Wrrapd checked, the new item's
  modal is locked to the order ZIP. Unchecking the other Wrrapd items unlocks it.
- A bouquet picked under a different ZIP is cleared, so the shopper picks again from the
  current ZIP's bouquets (new `flowerZip` / `flower_zip` on saved choices).
- Files: `src/shared/giftee-zip-estimate.js` (`setLocked`), `src/shared/cart-gift-optin.js`,
  `src/retailers/lego/lego-gift-wrap-upsell.js`, `src/content/content-legacy.js`, all bundles.
- Tested: locked bar against live `api.wrrapd.com` (read-only, auto-confirmed, typing ignored,
  unlock restores Submit); shared 2-item modal (item 2 locked to 32218, Back unlocks item 1).

### E. Volume discounting (Oct 7)

Membership discount is **not** in this version.

**What the shopper sees** (only after Command Center rates are saved above 0):

- Gift-wrapping still shows the full base (example: 2 × $6.99 = **$13.98**).
- Directly under that line: **Multi-item base discount** (example: **-$1.40** at 10%). Never shown when the amount is $0.
- Tax is calculated **after** the discount.
- If one more wrap would raise the tier: *Gift-wrap another item to get a x% discount!*

**Tiers** (Command Center → Checkout pricing → Volume Discounting): **2**, **3 to 9**, **10+** whole percents 0–99. Save requires 10+ ≥ 3–9 ≥ 2. Defaults **0 / 0 / 0** (no discount until you save rates). Applies only to the wrap **base**, not AI, upload, flowers, or the box charge. Count is wrapped units in this Pay Wrrapd checkout (same giftee ZIP). The retailer order number is not known before the payment summary.

**Where it lives**

- Admin UI: `tracking-platform/src/components/admin-pricing-editor.tsx` (own Save → `PUT /api/admin/volume-discount`).
- Server math: `WrrapdServer/lib/volume-discount.js`, `lib/wrrapd-pricing.js` (pre-tax; older extensions without `multiItemDiscountAware` are not discounted so their charge still matches their summary).
- Extension: `src/shared/volume-discount.js`, invoice rows, Amazon + LEGO + other-retailer payment summaries.
- Shopper Your orders: combined summary on the right (`wrrapd-orders-bridge.php`).
- Command Center order detail: discount split across separately listed items.

Editor notes: `docs/VOLUME-DISCOUNT.md`.

**Checkout rebuild loop:** LEGO’s page watcher was calling the price API on every animation frame, so the discount line flashed and Chrome ran out of connections (`ERR_INSUFFICIENT_RESOURCES`, then 429). The watcher now only puts the existing panel back. Prices are requested once, then at most every 15 seconds if that request failed. Disable every other Wrrapd extension while testing — a second copy still injects `content-lego.js` and keeps calling the API.

### Checks run on the VM for 3.0.14

- All 10 bundles load in simulated retailer pages against live `api.wrrapd.com` with zero errors; also with the API unreachable.
- Target cart with a submitted giftee ZIP in session calls `/api/delivery-hub` and stores Jacksonville (`jax-1`, 150 BUSCH DR #26067).
- Live `GET /api/delivery-hub?postalCode=32218` (and 30309, while only Jacksonville is active) returns the Jacksonville hub with Amazon CORS.
- Hub switch tested with a mocked second hub (Atlanta): hub fill, Pay Wrrapd address and tax fallback all moved to it; a failed lookup fell back to Jacksonville; an expired pick (over 3 days) was ignored.
- `npm run build`, `npm run build:prod`, Best Buy / Kohl's / order-capture fixture checks, server `npm test` (including `test/volume-discount.test.js`) all pass.
- Built bundles contain no hub address, hub ZIP, hub phone, or price constants.

---

## 3.0.13 — published on Chrome Web Store (approved Oct 6)

Item ID **`ofokdnajfbjmpbeocibingpiadnoccfc`**. Website install links and `$latest_version` point here.

- Reads the retailer order number on each retailer's confirmation ("thank you") page after Pay Wrrapd, using each
  retailer's real order-number format (Amazon, Target, Walmart, Best Buy, Kohl's, Nordstrom, Sephora, Ulta, LEGO, Etsy).

## 3.0.12 — submitted Oct 3

- Hub switched from PO BOX 26067 to USPS Street Addressing: WRRAPD INC, 150 BUSCH DR #26067, JACKSONVILLE FL 32218 (all 10 retailers).
