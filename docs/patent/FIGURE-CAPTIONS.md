# Drawing Sheet Captions — Provisional FIGS. 1–10

Use these exact captions under each figure. Draw simple black-and-white boxes and arrows.

---

## FIG. 1 — System Architecture

Boxes:
- Retailer Websites (Amazon, Target, Walmart, …)
- Browser Extension (per-retailer adapters + shared hub-ship modules)
- Pay / API Server (pricing, Stripe, AI designs, order JSON)
- Cloud Object Storage (print-ready designs, proof media)
- Tracking Platform (orders, tokens, WrapStars)
- Hub / WrapStar Network
- Customer Tracking Page + Email/SMS

Arrows: Retailer ↔ Extension; Extension ↔ Pay/API; Pay/API → Storage; Pay/API → Tracking; Tracking ↔ WrapStar; Tracking → Customer.

Caption: **FIG. 1** is a system architecture diagram of a multi-retailer gift fulfillment orchestration platform.

---

## FIG. 2 — Non-Amazon Hub-Ship Flow

Vertical swimlane steps:
1. Scrape cart
2. Opt-in + gift choices + ZIP gate
3. Gate retailer checkout
4. Pay service (separate platform)
5. Autofill + lock hub address
6. Conflict guard (pickup / alt address)
7. Place retailer order to hub
8. Ingest + schedule (+1 day)

Caption: **FIG. 2** is a flow diagram of a browser-extension hub-ship checkout method.

---

## FIG. 3 — Amazon Multi-Address Flow

Steps:
1. Per-ASIN wrap election
2. Map ASIN → hub vs default address
3. Inline summary + Pay
4. Gate Place Order
5. Pay service
6. Place Order hook → ingest delivery hints
7. Schedule from Amazon dates

Caption: **FIG. 3** is a flow diagram of multi-address routing and place-order gating on a multi-destination retailer checkout.

---

## FIG. 4 — AI Design Pipeline

Steps:
1. Occasion / prompt (+ product context)
2. Generative text concepts
3. Generative tileable images
4. User selects design
5. Upscale (optional)
6. Store print-ready PNG + metadata sidecar
7. Bind path to order line → fulfillment

Caption: **FIG. 4** is a flow diagram of generative wrap-design creation, selection, and order binding.

---

## FIG. 5 — Cart Fingerprint Sync

Steps:
1. Build fingerprint (ids + qty)
2. Store with session
3. Cart changes? → invalidate payment + require review
4. Payment success → snapshot fingerprint
5. Optional preferred: re-verify cart before Place Order

Caption: **FIG. 5** is a flow diagram of cart fingerprinting and dual-platform checkout synchronization.

---

## FIG. 6 — Ingest, Pay-Lock Merge, Delivery Preference

Steps:
1. Ingest payload (external id, dates, line items)
2. Canonicalize external id
3. Merge open orders / pay-lock protect
4. Multiple dates? → token + email/SMS → choice page or deadline default
5. Schedule Wrrapd day = retailer date + offset

Caption: **FIG. 6** is a flow diagram of order ingest reconciliation and multi-date delivery preference resolution.

---

## FIG. 7 — WrapStar Proof Loop

Steps:
1. Assign WrapStar
2. Start delivery / GPS broadcast (offline queue optional)
3. Wrap / prepare gift
4. Upload proof media
5. Status → delivered; earnings
6. Customer track page polls status + map + proof

Caption: **FIG. 7** is a block diagram of contractor fulfillment, geolocation tracking, and proof-of-service media delivery.

---

## FIG. 8 — Tiered Dimension Resolution (Preferred)

Three parallel/priority paths into “Wrap Specification”:
1. Catalog lookup by product id
2. AI inference from metadata
3. Hub sensor verification

Output → print / machine instructions

Caption: **FIG. 8** is a schematic of tiered product-dimension resolution for wrapping.

---

## FIG. 9 — Two-Phase Commit (Preferred)

Phase 1: Service payment success → create order  
Phase 2: Retailer order placed?  
- Yes → lock fulfillment  
- No / abandon → refund + cancel print job

Caption: **FIG. 9** is a flow diagram of two-phase cross-platform transaction commit and abandonment handling.

---

## FIG. 10 — Video Audit Trail (Preferred)

Stages with media artifacts:
(a) Receipt → (b) Unpack → (c) Wrap → (d) Outbound handoff  
→ Upload → Tracking page

Caption: **FIG. 10** is a schematic of a multi-stage video audit trail linked to customer tracking.

---

## Drawing tips for USPTO provisional

- Black lines on white; no screenshots of live Amazon UI (avoid trademark clutter; use generic “Retailer Checkout”).
- Number each figure FIG. 1, FIG. 2, …
- One invention concept per sheet is fine; multiple sheets OK.
- Scan phone photos of whiteboard sketches into a single PDF if needed — better to file with rough FIGS. 1–3 than none.
