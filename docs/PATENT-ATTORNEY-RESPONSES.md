# Wrrapd Provisional Patent — Attorney Response Package

**Prepared for:** Provisional patent counsel  
**Date:** July 12, 2026  
**System state:** Extension v2.0.21 · 10 retailers · live wrrapd.com · pay server · tracking platform · WrapStar network  
**Repository:** `/home/phill/wrrapd-GCP` (monorepo: `extension/`, `backend/`, `tracking-platform/`, `wordpress/`)

---

## How to Use This Document

This package answers counsel’s seven technical questions with **current implementation facts**, **recommended claim framing**, and **patent-strategy notes** explaining why each question was likely asked. Section V proposes **additional independent and defensive claims** counsel may not have surfaced. Section VI maps what is built vs. what should be described as preferred embodiments.

**Important distinction for drafting:** Several customer-facing and contractual commitments (notably **Video Audit Trail**) are described in Terms & Conditions and WrapStar agreements but are **not yet implemented in software**. Claims should distinguish **implemented methods** from **preferred embodiments** to preserve broad protection without overclaiming reduction to practice.

---

## Executive Summary

Wrrapd is a **multi-retailer, browser-mediated gift-fulfillment orchestration platform** that:

1. Intercepts third-party retailer checkouts **without retailer API access**
2. Collects payment on a separate platform (`pay.wrrapd.com`) **before** retailer order completion
3. Programmatically routes specific cart lines to a physical hub address under **Limited Agency Appointment**
4. Generates AI wrapping designs bound to specific product/order identities
5. Schedules and tracks last-mile delivery with customer-facing live tracking
6. Operates a distributed **WrapStar** fulfillment network with documented proof-of-service requirements

The strongest patent position is **not any single feature** but the **end-to-end orchestration method** across unaffiliated retail platforms, payment systems, hub logistics, and delivery proof — implemented through a browser extension acting as a limited agent on the customer’s behalf.

---

## I. The Hardware-Software Handshake

### Q1. AI Modal to Machine: Standard image or wrapping map (G-code)?

#### Current implementation

The AI design pipeline produces **print-ready raster images (PNG)** plus structured metadata — **not** G-code or machine-native wrapping maps.

**Pipeline (implemented):**

1. Extension calls `POST /generate-ideas` on `api.wrrapd.com`
2. **OpenAI GPT-4o** generates 3 design concepts (`title`, `description`) as strict JSON
3. **Stability AI Stable Image Core** renders tileable wrap-pattern PNGs (~1.5MP each)
4. Customer selects a design; extension calls `POST /api/save-ai-design`
5. Selected design is **upscaled** via Stability Fast Upscaler (up to 4×) when configured
6. Files stored in GCS bucket `wrrapd-media`:
   - Archive: `generated_patterns/all/`
   - **Print-ready:** `generated_patterns/for_print/{orderNumber}-{asin}-{index}.png`
   - **Metadata sidecar:** companion `.txt` with `designTitle`, `itemTitle`, `orderNumber`, `asin`, `optionIndex`, `prompt`, `upscaledForPrint`, `selectedForOrder`
7. On payment confirmation (`process-payment`), the GCS path travels into the order record (`wrappingDesignStoragePath`, `aiDesignTitle`) and fulfillment emails

**Not yet built:** G-code, NC programs, coordinate geometry, fold-zone math, or machine-specific instruction formats.

**Key code paths:**

- `backend/wrrapd-api-repo/WrrapdServer/server.js` — `/generate-ideas`, `/api/save-ai-design`
- `extension/src/shared/cart-gift-optin.js` — shared retailer AI modal
- `extension/src/content/content-legacy.js` — Amazon AI modal

#### Recommended claim framing

| Claim tier | Description | Status |
|------------|-------------|--------|
| **Independent (broad)** | Method of generating an AI wrap design keyed to a specific retail product identity (ASIN/SKU/listing ID) and binding it to a fulfillment order | **Implemented** |
| **Dependent** | Structured wrap specification object comprising image path + product ID + order ID + metadata sidecar | **Partially implemented** (GCS `.txt` sidecar) |
| **Preferred embodiment** | Machine-native wrapping map (G-code or proprietary format) derived from product dimensions + design placement | **Planned** |

#### Patent-strategy note

Counsel asked this to determine **hardware-coupling strength**. A plain PNG is easier to design around. Wrrapd’s intermediate position — **ASIN-keyed AI design + print-ready folder + metadata sidecar** — is already stronger than “send an image.” Recommend claiming the **wrap specification artifact** as its own invention: a structured data object that uniquely ties a generative design to a specific product order line, regardless of final machine format.

#### Additional claims (beyond counsel’s inquiry)

- **Claim A:** Computer-implemented method of generating tileable gift-wrap patterns via generative AI, conditioned on occasion/prompt and retailer product context
- **Claim B:** System for archiving all generated design candidates (`all/` vs `unused/`) while promoting only the customer-selected design to a print-ready namespace (`for_print/`)
- **Claim C:** Method of upscaling a customer-selected AI design to print resolution as part of order finalization, not at generation time

---

### Q2. Physical Sensing: Sensors at hub or digital data only?

#### Current implementation

No sensor integration exists in software. The extension does **not** scrape physical package dimensions from retailer pages. Hub intake verification is operational/manual today.

#### Planned architecture (incorporate into specification)

| Source | Method | Retailers |
|--------|--------|-----------|
| **Primary** | ASIN / product ID → retailer catalog dimension lookup | Amazon (ASIN → Amazon catalog/SP-API) |
| **Secondary** | Retailer product ID → retailer-specific catalog APIs | Target (TCIN), Walmart (USItemId), etc. |
| **Tertiary** | AI-assisted dimension inference from product title + ID + retailer | All retailers lacking structured dimension APIs |
| **Physical embodiment** | Sensor verification at hub intake (preferred machine embodiment) | Future hardware integration |

#### What IS digitally captured today (per line item)

- Product identifiers: ASIN, TCIN, USItemId, SKU, listing ID, style ID (retailer-specific)
- Title, image URL, quantity
- Wrapping option (standard / AI / upload)
- AI design path, upload path, occasion, gift message
- Hub routing address (Jacksonville PO Box 26067)
- Giftee delivery address (collected on pay page, not retailer checkout)
- Retailer estimated delivery date (scraped for non-Amazon; Amazon delivery radios for Amazon)

#### Recommended claim framing

Do **not** frame this as “we rely on scraped dimensions” (not implemented yet). Frame as a **tiered dimensional resolution system**:

1. **Catalog-first resolution:** Using the retailer’s product identifier as proxy for manufacturer-declared dimensions
2. **Cross-retailer AI enrichment:** When structured data unavailable, inferring dimensions from product metadata
3. **Physical verification fallback:** Sensor-based confirmation at hub (preferred embodiment)

This covers the **software path independent of hardware build-out**.

#### Patent-strategy note

Counsel probed for **closed-loop system claims** (digital spec → machine verifies → adjusts → executes). Wrrapd can claim the **open-loop software method** now and reserve closed-loop as preferred embodiment. The ASIN-as-dimensional-key argument is non-obvious: prior art in gift wrapping assumes physical measurement; Wrrapd treats the retailer’s product catalog as authoritative.

#### Additional claims

- **Claim D:** Method of resolving product physical dimensions for gift-wrapping using a retailer-specific product identifier as lookup key
- **Claim E:** AI-mediated dimension enrichment for products lacking structured dimension data in retailer catalogs
- **Claim F:** System combining catalog-derived dimensions with optional physical sensor verification at a fulfillment hub

---

## II. Extension UI & Redirection

### Q3. How does the extension “guide” the user during address selection?

#### Current implementation — two architectural families

**Family A: Non-Amazon hub-ship retailers** (Target, Walmart, Nordstrom, Kohl’s, Sephora, Ulta, Best Buy, Etsy, LEGO)

| Mechanism | Description |
|-----------|-------------|
| **Cart opt-in card** | Orange-bordered section injected above checkout; Yes/No radio for Wrrapd |
| **Gift choices modal** | Full-screen overlay: per-item wrap/AI/upload/flowers/message/occasion |
| **Giftee ZIP gate** | Modal ZIP bar; calls `api/pricing-preview` with giftee ZIP; blocks until allowed service area confirmed |
| **Checkout gating** | Retailer Place Order / Checkout button **disabled** until Wrrapd payment succeeds |
| **Hub autofill** | After payment, extension **programmatically fills** retailer shipping form with hub address via HTML `autocomplete` tokens |
| **Hub field lock** | Shipping inputs locked (`data-wrrapd-hub-locked`) to prevent user override |
| **Conflict guard** | Intercepts clicks on “store pickup,” “curbside,” “ship to different address”; modal: Keep Wrrapd vs Switch |
| **Trusted-click detection** | Distinguishes user clicks (`e.isTrusted`) from programmatic autofill clicks |
| **Fulfillment pre-check** | Hides Wrrapd option for pickup-only or mixed pickup+ship carts |

**Family B: Amazon (legacy, more sophisticated)**

| Mechanism | Description |
|-----------|-------------|
| **Multi-address per ASIN** | `selectAddressesForItemsSimple()` maps each ASIN to hub vs default address |
| **Address book automation** | Adds Wrrapd hub to Amazon address book programmatically |
| **Guided overlays** | SVG dimmer + halo on Continue button; manual “Deliver to this address” path |
| **Button interception** | Blocks `#orderSummaryPrimaryActionBtn` until address state correct |
| **Navigation blocking** | `blockNavigation()` during checkout automation |
| **Place Order gate** | Disables “Place your order” until Wrrapd paid; MutationObserver rescans |
| **Post-pay Place Order hook** | Intercepts real Place Order click → POSTs tracking ingest → resubmits form |

#### Legal foundation (all retailers)

Extension Terms & Conditions include **Limited Agency Appointment**:

> *“By using the Wrrapd browser extension and clicking the agreement button, you explicitly appoint Wrrapd Inc. as your Limited Agent and Attorney-in-Fact for the sole purpose of navigating the [retailer] interface and entering delivery information on your behalf.”*

Scroll-to-accept occurs before any programmatic action.

**Key code paths:**

- `extension/src/shared/wrrapd-hub.js`
- `extension/src/shared/wrrapd-conflict-guard.js`
- `extension/src/shared/retailer-checkout-pay-flow.js`
- `extension/src/content/content-legacy.js`
- `extension/src/shared/wrrapd-terms.js`

#### Recommended claim framing

This is **not** passive UI guidance. It is **active, programmatic checkout co-piloting** — reading and rewriting live retailer DOM state without retailer API partnership. Limited Agency provides legal cover for the technical method.

#### Patent-strategy note

Counsel asked passive vs. active because **active claims are substantially stronger**. The conflict guard — detecting when a user is about to undo hub routing post-commitment — is a novel sub-claim with no prior art in gift/shipping extensions.

#### Additional claims

- **Claim G:** Browser extension method of programmatically entering a hub fulfillment address into a third-party retailer’s checkout form under limited agency appointment
- **Claim H:** Real-time conflict detection and remediation when user attempts to override hub routing after Wrrapd service election
- **Claim I:** Trusted-click vs. programmatic-click discrimination for distinguishing user intent from extension automation
- **Claim J:** Per-retailer isolated content-script bundles with shared hub-ship orchestration logic (config-driven adapter pattern across 10+ retailers)
- **Claim K:** Fulfillment-mode analysis (pickup vs. ship) to conditionally enable/disable gift-wrap service election

---

### Q4. Wrrapd Summary: Sidebar or pop-up? Does it verify cart total?

#### Current implementation

**Amazon path:** Inline injection — `createWrrapdSummary()` inserts `div#wrrapd-summary` as sibling to Amazon’s native `#spc-order-summary`, styled to match Amazon typography (`summary-alignment.js`). Shows Wrrapd line items, total, “Pay Wrrapd” button → green “Payment successful. Place order with Amazon now.”

**Non-Amazon path:** Standalone “Pay Wrrapd” panel injected into checkout page (amber gradient card, invoice rows). Payment via `window.open` popup to `pay.wrrapd.com/checkout/{retailer}` (480×820px). `postMessage` handshake on success.

#### Cart verification

| Mechanism | Status | Description |
|-----------|--------|-------------|
| **Server-side pricing validation** | ✅ Implemented | Backend recalculates from `pricingCart`; rejects client/server mismatch |
| **Cart fingerprinting** | ✅ Implemented | `buildCartFingerprint()` creates `id:SKU@q2\|\|title:foo@q1` hash; stored in sessionStorage |
| **Payment invalidation on cart change** | ✅ Implemented | `syncGiftSessionWithCart()` clears payment flag when fingerprint changes |
| **Post-payment fingerprint snapshot** | ✅ Implemented | On pay success, fingerprint rewritten; later edits invalidate paid state |
| **process-payment rollback** | ✅ Implemented | If server finalization fails after Stripe success, checkout re-blocked |
| **Live retailer cart re-read after payment** | ❌ Not implemented | No reverse check that retailer cart still matches paid manifest |

**Key code paths:**

- `extension/src/content/content-legacy.js` — `createWrrapdSummary()`
- `extension/src/shared/retailer-checkout-pay-flow.js` — `mountSummaryPanel()`
- `extension/src/shared/cart-gift-sync.js` — fingerprinting
- `backend/wrrapd-api-repo/WrrapdServer/lib/wrrapd-pricing.js` — server validation

#### Recommended claim framing

Inline co-rendering (Amazon) and payment-popup model (non-Amazon) are two UI claim embodiments. Cart fingerprinting is **tamper detection** in a dual-checkout context.

#### Patent-strategy note

Counsel probed for **bidirectional data link** between Wrrapd payment and retailer cart. Wrrapd has **unidirectional tamper detection** (cart change invalidates payment) but not **post-payment verification** (payment succeeded → confirm retailer cart unchanged → enable Place Order). The latter remains the strongest unbuilt claim and should be described as preferred embodiment.

#### Additional claims

- **Claim L:** Inline injection of a co-branded payment summary within a third-party retailer’s native order-summary UI
- **Claim M:** Cart fingerprint-based payment invalidation when retailer cart composition changes after service election
- **Claim N:** Dual-checkout reconciliation: Wrrapd payment confirmation gated on retailer cart manifest matching pre-payment snapshot
- **Claim O:** Server-validated pricing cart independent of client-displayed totals (anti-tamper pricing)
- **Claim P:** Structured checkout invoice with canonical aggregate line codes (`WRPD_GIFT_WRAP_BASE`, `WRPD_CUSTOM_DESIGN_AI`, etc.) for cross-platform billing reconciliation

---

## III. Multi-Vendor & Logistics

### Q5. Multi-Vendor “Hold” Logic: How are orders grouped at the hub?

#### Current implementation

No formal `OrderGroup` or “waiting room” database entity exists. Grouping operates through **three implemented mechanisms**:

**1. Amazon multi-date scheduling (per-order)**

- `amazon-delivery-hints.js` scrapes delivery date radios for Wrrapd-bound shipments
- Writes `amazonDeliveryDays` + `wrrapdAmazonGrouping` (`earliest` / `latest` / `pending`) to sessionStorage
- Ingest layer schedules Wrrapd delivery as Amazon date + 1 calendar day @ 14:00 ET

**2. Customer delivery preference resolution**

- Multiple Amazon dates without explicit grouping → `deliveryPreferencePending: true`
- Secret `deliveryPreferenceToken` generated
- Customer receives email + SMS with link to `/delivery-choice?t={token}`
- Choices: `together` (last Amazon date) or `earliest` (first)
- Deadline: EOD Eastern; cron job defaults to `together_deadline_default` if no response

**3. Firestore merge / deduplication**

- `findOpenOrdersForIngestMerge()` matches ingests against open orders sharing `canonicalExternalOrderId`
- Amazon pack-line suffix stripped (`…-6778201-01` → `…-6778201`)
- Pay-backed rows protected from staging re-ingest overwrite (`TRACKING_MERGE_VERSION = tracking-merge-v2026-04-21-pay-lock-source`)
- Duplicate open docs deleted after merge

**4. Cross-retailer attribution (not yet grouping)**

- `OrderRetailer` enum: Amazon, Target, Lego, Ulta, Walmart, Nordstrom, Kohl’s, Sephora, Best Buy, Etsy
- Each ingest carries `retailer` field and retailer-specific scheduling
- Non-Amazon: `retailerEstimatedDeliveryDate` → Wrrapd day = retailer date + 1

**Key code paths:**

- `extension/src/content/lib/amazon-delivery-hints.js`
- `tracking-platform/src/lib/order-ingest.ts`
- `tracking-platform/src/lib/data.ts`
- `tracking-platform/src/app/delivery-choice/page.tsx`

#### Recommended claim framing

Delivery-preference token system is a **multi-party scheduling protocol** — novel and fully implemented. Cross-retailer hub hold should be described as preferred embodiment with formal `HubHoldRecord` schema.

#### Patent-strategy note

Counsel asked about “waiting room” because **scheduled-hold logistics with customer-defined release conditions** is patentable. Wrrapd’s token-based, time-bounded customer preference flow is more sophisticated than simple “group or separate.”

#### Additional claims

- **Claim Q:** Tokenized, time-bounded customer preference resolution for multi-date delivery scheduling
- **Claim R:** Method of scheduling fulfillment delivery as retailer-promised-date plus fixed offset in a defined timezone
- **Claim S:** Pay-lock merge protocol preventing staging/extension ingests from overwriting checkout-confirmed order data
- **Claim T:** Canonical external order ID normalization across retailer pack-line suffixes
- **Claim U (preferred embodiment):** Cross-retailer hub hold — holding packages from multiple retailers until all arrive, then releasing for unified delivery

---

### Q6. Failed Transaction Handshake: Pay Wrrapd but cancel retailer checkout?

#### Current implementation

| Mechanism | Status |
|-----------|--------|
| Payment gated on Stripe `status === 'succeeded'` | ✅ Implemented |
| PaymentIntent idempotency (`findExistingOrderByPaymentIntent`) | ✅ Implemented |
| Cart fingerprint invalidates payment on cart change | ✅ Implemented |
| process-payment rollback re-blocks checkout | ✅ Implemented |
| Stripe webhook for payment events | ❌ Not implemented |
| Automated refund on retailer checkout abandonment | ❌ Not implemented |
| Cancellation signal to hub / print job | ❌ Not implemented |
| Browser-side “did user place retailer order?” detection | ❌ Not implemented |

#### What IS claimable today

- Payment-confirmation-gated order creation (order doesn’t exist until Stripe confirms)
- Cart tamper detection invalidating prior payment state
- Server-side payment verification before any fulfillment action

#### Recommended claim framing (preferred embodiment)

1. Extension detects retailer checkout abandonment (navigation away, session timeout, cart cleared)
2. Signals `checkout_abandoned` to Wrrapd API
3. Backend initiates automated Stripe refund OR opens grace-period hold
4. Hub notified to cancel any initiated wrap job

#### Patent-strategy note

This is the **most legally novel unbuilt feature**. Wrrapd creates a **cross-platform transaction dependency**: binding payment to Party A (Wrrapd) contingent on subsequent action with Party B (unaffiliated retailer). No prior art in gift-wrapping describes this two-phase commit. Building a minimal version before non-provisional converts described embodiment to implemented method.

#### Additional claims

- **Claim V:** Two-phase cross-platform transaction commit: service payment (Phase 1) contingent on retailer order placement (Phase 2)
- **Claim W:** Browser-side retailer checkout abandonment detection triggering automated service payment reversal
- **Claim X:** Grace-period hold between Phase 1 confirmation and Phase 2 completion with timed auto-refund
- **Claim Y:** Cart fingerprint change as implicit Phase 2 failure signal

---

## IV. Operational Proof

### Q7. Video record triggered by machine? How pushed to tracking page?

#### Current implementation

| Component | Status |
|-----------|--------|
| Video capture at hub/wrap station | ❌ Not in software |
| Machine-cycle-triggered documentation | ❌ Not in software |
| Video upload pipeline | ❌ Not in software |
| Video playback on tracking page | ❌ Not in software |

#### What IS implemented

| Component | Description |
|-----------|-------------|
| **Proof photo (delivery)** | WrapStar uploads JPEG/PNG via PWA → GCS → `proofPhotoUrl` on order → displayed on `/track/{token}` |
| **Live GPS tracking** | Auto-GPS every 30s → `latestLocation` → Google Maps iframe on tracking page |
| **Status timeline** | `pending` → `scheduled` → `assigned` → `in_progress` → `out_for_delivery` → `delivered` |
| **20-second polling** | `/api/public/track/[token]` updates customer view |
| **Offline queue** | WrapStar PWA queues GPS/proof in localStorage; flushes on reconnect |

#### Contractual / operational foundation (not yet software)

- Extension Terms (Clause 10): **Video Audit Trail** — video proof for (a) package receipt, (b) unpackaging, (c) wrapping, (d) outbound carrier handoff
- WrapStar IC Agreement: video proof required on every order; missing proof = grounds for suspension
- WrapStar orientation: video proof is “non-negotiable”
- Refund policy tied to “once wrapping process has been documented”

**Docs:** `docs/wordpress-snippets/wrrapd-wrapstar-ic-agreement.md`, `wrrapd-wrapstar-orientation-content.md`

#### Recommended claim framing

Frame video as **preferred embodiment** of broader **“proof of craftsmanship”** claim. Implemented today: **digital chain-of-custody** from payment through delivery proof. GCS infrastructure, tracking poll architecture, and WrapStar contractual requirements establish enabling architecture.

#### Patent-strategy note

Counsel probed for **automated event-triggered documentation** (hardware-software integration). Current photo-proof + live-GPS extends proof-of-custody into delivery leg — novel for gift services. Video at wrapping stage completes the chain; claim as preferred embodiment with existing infrastructure as enabling architecture.

#### Additional claims

- **Claim Z:** Proof-of-craftsmanship system: verified documentation of gift-wrapping service performance, distinct from proof-of-delivery
- **Claim AA:** Multi-stage audit trail: (a) package receipt, (b) unpackaging, (c) wrapping, (d) outbound handoff — each stage producing customer-accessible evidence
- **Claim AB:** Live customer tracking page with real-time GPS, ETA, status progression, and proof media — applied to gift-wrapping service (not package logistics)
- **Claim AC (preferred embodiment):** Machine-cycle-triggered video capture automatically pushed to customer tracking page via existing poll architecture

---

## V. Additional Claims Counsel May Not Have Surfaced

These represent Wrrapd’s **broadest defensible territory** — system-level inventions competitors cannot replicate without building the entire platform.

### System-Level Independent Claims (recommended for specification)

**Claim 1 — Multi-Retailer Hub-Ship Orchestration Method**

> A computer-implemented method comprising: detecting a user’s election of a gift-wrapping service on a third-party retailer’s checkout page; collecting payment on a separate payment platform; programmatically routing the retailer’s shipping address to a hub fulfillment address under limited agency appointment; and scheduling last-mile delivery to a giftee address collected independently of the retailer checkout.

**Claim 2 — Browser Extension as Limited Agent**

> A system wherein a browser extension, upon explicit user appointment as limited agent, programmatically navigates and modifies a third-party retailer’s checkout interface to redirect specific cart line items to a fulfillment hub address without retailer API access or cooperation.

**Claim 3 — Dual-Platform Checkout Synchronization**

> A method of synchronizing payment on a first platform (gift-wrap service) with order placement on a second platform (retailer), comprising: gating retailer checkout progression on first-platform payment confirmation; detecting changes to retailer cart composition; and invalidating first-platform payment state upon cart mutation.

**Claim 4 — AI Design-to-Fulfillment Binding**

> A method of generating a gift-wrap design via artificial intelligence, binding the design to a specific retail product identifier and order line item, storing the design in a cloud namespace with structured metadata, and delivering the design path to a physical fulfillment operation as part of an order payload.

**Claim 5 — Tiered Product Dimension Resolution**

> A system for resolving physical product dimensions for gift-wrapping comprising: primary lookup via retailer product identifier in retailer catalog; secondary AI-mediated inference from product metadata; and optional physical sensor verification at fulfillment hub.

**Claim 6 — Tokenized Multi-Date Delivery Preference**

> A method of resolving conflicting delivery dates across multiple items comprising: detecting multiple retailer-promised dates; generating a time-bounded secret token; transmitting the token to a customer via out-of-band channel; receiving customer preference selection; and adjusting fulfillment schedule accordingly, with automated default upon deadline expiration.

**Claim 7 — Pay-Lock Order Merge Protocol**

> A data reconciliation method for orders ingested from multiple sources comprising: identifying a pay-backed authoritative order record; preventing non-pay ingests from overwriting checkout-confirmed fields; merging supplemental data from secondary ingests; and deleting duplicate records.

**Claim 8 — Distributed WrapStar Fulfillment Network**

> A system for distributed gift-wrapping fulfillment comprising: a network of independent contractors (WrapStars) onboarded via contractual agreement requiring proof-of-service documentation; automated earnings calculation with platform revenue split; GPS-tracked last-mile delivery; and customer-facing live tracking with proof media.

**Claim 9 — Geo-Keyed Dynamic Pricing**

> A method of calculating gift-wrap service pricing comprising: per-retailer unit price configuration; geographic rules based on state, county, and postal prefix; date-range surge multipliers; server-side cart validation independent of client-displayed amounts; and ZIP-based sales tax estimation from indexed tax tables.

**Claim 10 — Retailer DOM Resilience via AI Proxy**

> A method of maintaining browser extension functionality across retailer UI changes comprising: proxying DOM-selector discovery requests through a server-side AI model; returning suggested selectors to the extension; and adapting retailer-specific scraping without extension update deployment.

### Defensive Claims (block competitor design-arounds)

| Claim | Purpose |
|-------|---------|
| Per-retailer isolated bundles with shared orchestration | Blocks “single script for all retailers” |
| Conflict guard with trusted-click detection | Blocks “warning only” approaches |
| Hub field lock after autofill | Blocks “suggest the address” |
| Checkout invoice with canonical line codes | Blocks free-form billing |
| Customer identity bridge (email → `wrrapdCustomerId` → WordPress claim) | Blocks anonymous per-session-only models |
| Retailer delivery date scrape → +1 day scheduling | Blocks fixed delivery windows |

---

## VI. Implementation vs. Specification Matrix

| Feature | Implemented | Describe as | Priority before non-provisional |
|---------|-------------|-------------|--------------------------------|
| AI design → GCS → order binding | ✅ Yes | Independent claim | — |
| Hub address autofill + lock | ✅ Yes | Independent claim | — |
| Limited Agency framework | ✅ Yes | Independent claim | — |
| Cart fingerprint payment invalidation | ✅ Yes | Dependent claim | — |
| Delivery preference token flow | ✅ Yes | Independent claim | — |
| Pay-lock merge protocol | ✅ Yes | Dependent claim | — |
| Live GPS + photo proof tracking | ✅ Yes | Independent claim | — |
| 10-retailer hub-ship platform | ✅ Yes | Independent claim | — |
| ASIN → dimension lookup | ❌ Planned | Preferred embodiment | **High** |
| AI dimension inference | ❌ Planned | Preferred embodiment | Medium |
| Post-payment cart verification | ❌ Partial | Preferred embodiment | **High** |
| Two-phase refund on abandonment | ❌ Planned | Preferred embodiment | **High** |
| Video audit trail at hub | ❌ Contractual only | Preferred embodiment | Medium |
| Cross-retailer hub hold | ❌ Planned | Preferred embodiment | Medium |
| Wrap specification object (beyond sidecar) | ❌ Partial | Preferred embodiment | Medium |
| G-code / machine wrapping map | ❌ Planned | Preferred embodiment | Low (hardware-dependent) |

---

## VII. Recommended Filing Strategy

1. **File the provisional now** with broad system-level independent claims (Claims 1–10) plus all implemented dependent claims.
2. **Describe all unbuilt features as preferred embodiments** — reserves territory without requiring reduction to practice.
3. **Prioritize building** post-payment cart verification, two-phase refund, and ASIN dimension lookup before non-provisional — converts described embodiments to implemented methods.
4. **Emphasize the Limited Agency framework** — legal and technical innovation distinguishing Wrrapd from prior-art browser extensions.
5. **Claim the entire orchestration chain** as the primary invention; individual features as dependent claims.
6. **Include the WrapStar network model** — distributed fulfillment with contractual proof requirements is a system claim competitors cannot replicate without building the network.

---

## VIII. Architecture Reference (for counsel exhibits)

```
Retail sites (10 retailers)
    │
    ▼
Chrome Extension (MV3, per-retailer bundles)
    │  scrape cart · hub autofill · conflict guard · cart fingerprint
    │  Limited Agency T&C · gift modal · AI design selection
    ▼
pay.wrrapd.com / api.wrrapd.com (WrrapdServer)
    │  Stripe PaymentIntent · server-validated pricingCart
    │  process-payment · AI generate/save · GCS designs
    │  orders/*.json · customer registry · WordPress internal APIs
    ▼
tracking-platform (Cloud Run + Firestore)
    │  ingest merge · pay-lock · delivery-choice tokens
    │  WrapStar PWA · GPS · proof photo · live /track/[token]
    ▼
Customer (tracking · email · SMS)     WrapStar (wrap · deliver · proof)
```

**Hub address (canonical):** WRRAPD INC, PO BOX 26067, JACKSONVILLE FL 32226-6067

**Order number format:** `CC-TTTTTTTTT-RRRRRR` (2-letter retailer code + timestamp + random)

---

## IX. Related Internal Documentation

| Document | Path |
|----------|------|
| Extension architecture | `docs/EXTENSION-ARCHITECTURE.md` |
| Integration map | `docs/INTEGRATION-MAP.md` |
| Customer accounts | `docs/CUSTOMER-ACCOUNTS-AND-ORDER-HISTORY.md` |
| WrapStar IC agreement (draft) | `docs/wordpress-snippets/wrrapd-wrapstar-ic-agreement.md` |
| WrapStar orientation (draft) | `docs/wordpress-snippets/wrrapd-wrapstar-orientation-content.md` |
| Deployment | `DEPLOYMENT.md` (repo root) |

---

*This document reflects codebase state as of July 12, 2026. Update before non-provisional filing if material features ship (especially dimension lookup, two-phase refund, video audit trail).*
