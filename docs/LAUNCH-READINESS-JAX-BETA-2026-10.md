# Wrrapd — Jacksonville / Duval Beta Launch: Master Readiness Review

**Prepared:** Saturday, October 3, 2026 (updated the same evening with Roger's answers, then again late Oct 3 after the fixes in §1.3 and §1.4 shipped)
**For:** Roger (founder, first WrapRider, Flight Director)
**Scope:** Whole business and whole application — shopper site, Chrome extension, pay server, Command Center, contractor apps, hire funnel, hub/PO Box logistics, hardware, data/media architecture, legal, insurance, tax.
**Status:** INTERNAL. Never publish any part of this document. It contains pay mechanics, routing, and security findings.

How this was built: a read-only audit of the full monorepo (`extension/`, `backend/wrrapd-api-repo/WrrapdServer/`, `tracking-platform/`, `wordpress/`, `docs/`), plus live checks on Oct 3, 2026 against `wrrapd.com`, `apply.wrrapd.com`, `pros.wrrapd.com`, `api.wrrapd.com`, the Cloud Run service, Firestore, Cloud Storage, Cloud Scheduler, PM2, and the VM firewall. Evidence is in Exhibit C.

Status legend used everywhere:

| Mark | Meaning |
|---|---|
| **GREEN** | Built, working, verified or low risk |
| **YELLOW** | Works, but needs manual workaround, configuration, or proof by a test |
| **RED** | Launch blocker — must be fixed or consciously waived before Go |
| **GREY** | Not built; acceptable to defer for beta if a manual SOP covers it |

---

## Contents

1. Executive assessment — how close are we?
2. Business model review (with business-judgment notes)
3. System-by-system readiness review (17 systems)
4. The architecture question — "Will we hit an Uber-style wall?"
5. Hardware & kit program + Command Center Equipment module spec
6. SOPs — what exists, what must be written before launch
7. Timeline — phases and dates to public beta and through the holidays
8. **Exhibit A — Master Pre-Launch Checklist ("All Systems — Go/No-Go")**
9. Exhibit B — Questions for Roger
10. Exhibit C — Evidence captured on Oct 3, 2026

---

# 1. Executive assessment

## 1.1 Bottom line

**We are not "Go" today, but software is nearly there and operations are about halfway.** *(Updated Oct 4.)* The shopper-facing software (extension, pay page, Duval ZIP gating, Command Center order flow, hub intake, refunds, admin logins with codes, wrap shift recording, delivery photos, contractor pay, backups, monitoring) is about **85% ready** for a controlled beta. The physical operation is about **55% ready**: the tools for receiving packages at the hub, wrapping on video, and proving delivery are built, but none has been run end to end with a real order yet, and insurance (R9), the delivery-cost decision (R10), carrier test shipments (R1), hardware kits, and the first hires are still open. Sales tax (R8) is closed. Operations reaches 80%+ after the first dress rehearsals pass.

Realistic path:

| Milestone | Target date | Condition |
|---|---|---|
| Blockers fixed ("Stabilize") | Sun **Oct 11** | All RED items in §1.3 closed or waived |
| Internal dress rehearsals (Roger buys real gifts to friends) | **Oct 12 – Oct 18** | 10 end-to-end orders, zero unexplained failures |
| Friends-and-family closed beta | **Oct 19 – Nov 1** | Invite-only, cap 5 orders/day |
| **Public Duval beta launch** | **Mon Nov 2** (fallback Mon Nov 9) | Go/No-Go poll Fri Oct 30 passes |
| Holiday peak | Fri Nov 27 – Thu Dec 24 | At least 1 trained backup WrapRider/JoyRider by Nov 20 |

Launching publicly before Black Friday matters: it gives us ~3 calm weeks to find the failures before volume arrives.

## 1.2 What is genuinely strong

- **Duval ZIP gating** is live (34 ZIPs) and shown to shoppers before they invest time.
- **Amazon flow** is the most mature path and was frozen as golden on Sep 19.
- **Server-side repricing** exists for the Helcim path (the server, not the browser, decides most of the charge).
- **Command Center** has a real order lifecycle, auto-allocation within 15 miles, an allocation approval board, wrap shift recording with video, signed QR box labels for couriers, a public tracking page, a Twilio service desk, hourly-by-ZIP pay, weekly Stripe Connect payouts on a Thursday scheduler, and annual 1099 statements.
- **Hire funnel** has three separate tracks with apply forms, fit scoring, clickwrap agreements, and Command Center review.
- **Media design is fundamentally right**: photos and videos go to object storage with only a pointer in the database. That is the single most important decision for avoiding the "Uber wall" (see §4), and it was made correctly.

## 1.2a Decisions log

| Date | Decision | Effect on this plan |
|---|---|---|
| Oct 3 | Hub = USPS Premium PO Box with Street Addressing: **WRRAPD INC, 150 BUSCH DR #26067, JACKSONVILLE FL 32218** | Coded in extension **3.0.12** (all 10 retailers) + server hub detection. Old "PO BOX 26067" still recognized. Remaining: CWS publish + carrier tests (HUB-01/02) |
| Oct 3 | No Wrrapd code on the shipping label — match by packing slip | Retailer order # capture is mandatory (R2) |
| Oct 3 | All 10 retailers live for beta | EXT-19 per retailer; per-retailer off switch (EXT-20) |
| Oct 3 | Wrrapd Inc. is a **C corporation**; registered with Florida DOR; **2026 Florida Annual Resale Certificate** on file (expires Dec 31, 2026); Roger files sales tax **annually** and has done so every year | R8 closed (GREEN) |
| Oct 3 | **Free final delivery** stays for now | §2.3 A remains a watch item; revisit with beta data |
| Oct 3 | **No daily order cap** | CC-06 becomes a **pause switch** (not a cap). Kill switch EXT-21 still required |
| Oct 3 | **Flowers stay ON** (integral to the offer) | Flowers move from "recommend OFF" to a RED fix item (see System 17) |
| Oct 3 | Contractors **borrow a Wrrapd kit and return it** | §5 option 3. Equipment agreement + return flow required before first hire; counsel review of IC impact |
| Oct 3 | High-value threshold **$100** | No safe-drop above $100; hand to an adult at the door (SOP-07, DEL-09) |
| Oct 3 | Provisional patent **64/159,570** filed **Sep 22, 2026** (confirmation 3565) | LEG-10 done. Provisionals are never published or examined — not finding it on USPTO search is normal. **Non-provisional / PCT deadline: Sep 22, 2027** |
| Oct 3 | No backup person for Roger assumed | If Roger is unavailable on a delivery day: pause new orders, contact affected shoppers. Optional "Backup buddy" question added to WrapRider + JoyRider applications |
| Oct 3 | Micro-hub = the PO Box only (no separate facility; no camera) | HUB-10 changes: held packages live at Roger's wrap location; wrap video is the chain-of-custody record |
| Oct 3 | Helcim: all signals green, **not yet tested live** | PAY-01 must include one real live charge + refund with Roger's own card before beta |
| Oct 3 | All 210 VM orders are **dummy orders** | Clean up and make order numbers realistic + consistent (pending format choice) |

## 1.3 The launch blockers (RED), in priority order

| # | Blocker | Why it matters | Fix size |
|---|---|---|---|
| R1 | **Hub address is a USPS PO Box** (`PO BOX 26067, JACKSONVILLE FL 32226-6067` hard-coded in `extension/src/shared/wrrapd-hub.js`) | UPS, FedEx, and Amazon Logistics generally **cannot deliver to a USPS PO Box**. Many Amazon items, and most Best Buy / Walmart items, will refuse a PO Box or bounce. This could break most orders on day one. **Decision (Oct 3): use USPS Street Addressing** — **150 BUSCH DR #26067, JACKSONVILLE FL 32218** — coded in extension 3.0.12 on Oct 3. Remaining risk: Amazon Logistics drivers may still refuse a post office; prove with HUB-01/HUB-02 test shipments from every carrier, all 10 retailers. | Code done Oct 3 (3.0.12). Remaining: Chrome Web Store publish + carrier test shipments |
| R2 → YELLOW | **Fixed in code Oct 3 (ext 3.0.13 + Command Center):** the extension reads the retailer order number on each retailer's confirmation page after Pay Wrrapd; the shopper can also add it on the tracking page; Command Center **Hub intake** searches by packing-slip number, Wrrapd number, names, or item. Each retailer's real order-number format was researched (Amazon 3-7-7 digits, Target 15 digits, Walmart 13–15, Best Buy BBY01-…, Kohl's 10, Nordstrom 9, Sephora 11, Ulta letter + 9, LEGO T + 9, Etsy 10); the reader only acts on a "thank you for your order" page and only accepts that retailer's format. Remaining: publish 3.0.13 after Google approves 3.0.12, then confirm on one real order per retailer during dress rehearsals. Original finding: **No way to match an arriving box to its Wrrapd order.** Every package is addressed to "WRRAPD INC" and the extension does not capture the retailer order number or tracking number after checkout. **Decision (Oct 3): no Wrrapd code on the label — match by packing slip.** That makes capturing the **retailer order number** on each retailer's confirmation page mandatory, because the packing slip's order number is the only reliable key. Retailers that ship without a slip need a fallback (item + shopper name + expected date) and a quarantine shelf. | At the hub, Roger opens 6 identical-looking Amazon packages and cannot reliably tell whose gift is whose. Wrong gift to wrong giftee is the worst possible failure. | Medium: order-number capture for 10 retailers + intake search by order number |
| R3 → GREEN | **Fixed Oct 3:** private bucket `gs://wrrapd-proofs` linked to Firebase, `FIREBASE_STORAGE_BUCKET` set on Cloud Run, token download links, videos to Nearline at 30 days, recording capped near 1 Mbps. Remaining: one real photo + video upload during dress rehearsal. Original finding: **Proof photos, wrap videos, and QR labels very likely fail to upload in production.** Cloud Run has no `FIREBASE_STORAGE_BUCKET` / `GCS_BACKUP_BUCKET`, and Firebase is initialized without a default bucket (`tracking-platform/src/lib/firebase-admin.ts` L151–160). The code then silently returns `null`. | No chain-of-custody evidence, no delivery photo, no labels for couriers. | Small (1 env var + bucket + test) |
| R4 → GREEN | **Fixed Oct 3:** Command Center → **Hub intake** marks each order Received / Partly received / Damaged / Missing (note required for damaged or partial), shows who and when, and lists every order still waiting for a package. Original finding: **No hub inbound "receive package" step** in Command Center | We cannot see "package arrived / not arrived / damaged" per order, so we cannot catch the shopper who paid Wrrapd but never completed the retailer order. | Medium — manual sheet acceptable for beta |
| R5 → GREEN | **Fixed Oct 3:** courier/WrapRider screen has Start delivery → camera photo + GPS + "Handed to" name (required over $100) → Mark delivered; delivered cannot be set without the photo; the wrap photo no longer marks the order delivered. Original finding: **Delivery proof UI missing for the courier/WrapRider delivery step** — the API exists but the courier screen only has Start / Mark delivered. Separately, the WrapStar "wrap photo" path marks the order **delivered**. | Wrong status sent to shoppers; no door photo; disputes become unwinnable. | Small–medium |
| R6 → GREEN | **Fixed Oct 3:** VM orders + customers back up hourly (full nightly) to `gs://wrrapd-ops-backups`; `/health/backup` alerts if the last backup is over 3 hours old; Firestore point-in-time recovery + delete protection ON, daily backup kept 14 days. Remaining: one practice restore (DATA checklist). Original finding: **Orders' system of record is JSON files on one VM** with no scheduled backup (one tarball from Jun 19). Firestore has **point-in-time recovery OFF** and **delete protection OFF**, and no backup schedule. | One bad disk, a mistaken delete, or a bad deploy loses paid orders. | Small (configuration) |
| R7 → YELLOW | **Oct 3:** all three onboarding pages work on `apply.wrrapd.com` (`/onboarding/`, `/wraprider-onboarding/`, `/driver-onboarding/`), and Command Center now shows those links. **Roger, one step:** in SiteGround File Manager for the **apply** site, add `define( 'WRRAPD_WRAPSTARS_PROS_HOST', 'apply.wrrapd.com' );` to `wp-config.php` above "That's all, stop editing" — approval emails then link to `apply`. (Alternative: make `pros.wrrapd.com` a parked domain of the apply site.) Original finding: **`pros.wrrapd.com` is still "Under construction"**; `pros.wrrapd.com/wraprider-onboarding/` returns **404**. | Every approval email sends new contractors to a dead link. Not blocking Roger, blocking every hire. | Small (DNS / SiteGround) |
| R8 → GREEN | **Florida sales tax: closed.** Registered with Florida DOR, annual filer (Roger files every year), 2026 resale certificate on file. Checkout charges 7.5% on Wrrapd lines. | — | Done |
| R9 | **Insurance — none bound as of Oct 3.** Holding customers' goods (bailee), driving for business, and handling payments needs coverage. Agreements conflict (WrapStar agreement says no insurance mandate; onboarding demands a $1M general liability + inland marine certificate). | One crash or one stolen box of electronics without coverage could end the company. **Now the top non-software blocker.** | Broker call this week |
| R10 | **Unit economics of "free final delivery"** (see §2.3) | At the placeholder $30/hour contractor rate, a single-gift delivery costs far more than the $6.99 wrap fee. Fine while Roger delivers; not fine once hires do. | Business decision |

## 1.4 Important but not blocking (YELLOW, fix during beta)

- Stripe customer-side key is still **test mode** on the pay server; Helcim is the live customer processor. Stripe Connect for contractor payouts on Cloud Run **is live** (`sk_live_`). Decide: Helcim-only for customers, and remove/disable the Stripe customer checkout routes so nobody can reach a test-mode path.
- **Server does not enforce Duval ZIP at charge time** — only the browser does. Add a server check.
- **FIXED Oct 3 — $0.99 loose-item box:** the server pricing cart now keeps item title, category, and `needs_gift_box`, so the box is charged.
- **FIXED Oct 3 — pay server lockdown:** `/create-checkout-session` prices only from the server cart (no client-total fallback); `/api/proxy-tracking-ingest` accepts only paid orders (or the internal key) and takes email/phone from the saved order; CORS allowlist (`*.wrrapd.com`, the 10 retailers, the extension); per-IP rate limits (payment routes 20 per 10 minutes); nginx now passes the real shopper IP.
- **FIXED Oct 3 — refunds:** Command Center order page → **Refund** (full or partial, reason, cannot double-refund) through Helcim, or Stripe for older orders; shopper gets a refund email; Helcim webhook endpoint verifies signatures and records dashboard refunds. **Oct 4: webhook connected in Helcim (`https://api.wrrapd.com/api/payment-events`), verifier token installed, signed test accepted and forged test rejected.** SOP: `docs/REFUNDS-SOP.md`. **Roger:** add the Helcim webhook and send the verifier token (see SOP); one live $1 charge + refund (PAY-01).
- **FIXED Oct 3 — admin logins:** Command Center → **Set up admin login**: personal email + password + authenticator-app code, lockout after 8 wrong tries, codes cannot be reused. The first saved login retires the shared password (and signs out shared-password sessions). **Roger:** set yours up first. The contractor-app test seats (admin@wrrapd.com) still use the shared password.
- **FIXED Oct 3 — delivery messages:** shoppers get a text + email for "out for delivery" and "delivered" (with the door photo), once each; STOP opt-outs respected.
- **FIXED Oct 3 — schedulers:** `wrrapd-wrapstar-morning` (7:45 am ET daily) and `wrrapd-expire-delivery-preferences` (hourly) added next to weekly payouts.
- **FIXED Oct 3 — privacy policy:** updated for all 10 retailers, Helcim, texts/calls, proof of delivery, and Chrome Web Store Limited Use (live, "Last updated: October 3, 2026").
- **FIXED Oct 3 — monitoring + tests:** uptime checks on wrrapd.com, api health, pay checkout, apply, Command Center, and order-backup freshness, emailing admin@wrrapd.com; GitHub Actions runs pay-server tests (pricing, rate limits, Helcim webhook), Command Center type-check, and the extension build + fixture checks on every push. **Roger:** send a mobile number to add text alerts.
- **PARTLY FIXED Oct 3 — VM firewall:** remote desktop (3389) closed. SSH (22) is key-only but still open to the internet (about 2,700 bot attempts a day, all failing). **Roger:** choose "your home IP + Google IAP only" or leave key-only.
- Hire funnel: background check (Checkr), identity (Persona), and BoldSign W-9 are placeholders or need keys for JoyRider/WrapRider tracks.

## 1.5 Overall readiness scorecard

| # | System | Readiness | Status |
|---|---|---|---|
| 1 | Shopper website (wrrapd.com) | 85% | GREEN/YELLOW |
| 2 | Chrome extension — Amazon | 80% | YELLOW |
| 3 | Chrome extension — 9 other retailers | 55% | YELLOW |
| 4 | Payments & pricing integrity | 85% | GREEN/YELLOW (live $1 Helcim test PAY-01) |
| 5 | Pay/API server (VM) | 85% | GREEN/YELLOW (backups, lockdown, refunds done Oct 3) |
| 6 | Hub & PO Box inbound logistics | 55% | YELLOW (R1 carrier tests; R2 publish 3.0.13 + real-order checks) |
| 7 | Command Center — orders & allocation | 85% | GREEN/YELLOW |
| 8 | Wrap operations & video proof | 80% | GREEN/YELLOW (R3 fixed; prove one upload) |
| 9 | Delivery & proof of delivery | 80% | GREEN/YELLOW (R5 fixed; prove on a rehearsal) |
| 10 | Customer communications & service | 75% | GREEN/YELLOW |
| 11 | Contractor hiring & onboarding | 65% | YELLOW (R7: one wp-config line), GREEN for Roger |
| 12 | Contractor pay, payouts, 1099 | 75% | YELLOW |
| 13 | Hardware, kits & supplies | 10% | GREY → must exist before first hire |
| 14 | Data, media & architecture | 80% | GREEN/YELLOW (R6 fixed; practice a restore) |
| 15 | Security & privacy | 75% | YELLOW (Roger: admin login, SSH choice) |
| 16 | Monitoring, backup & disaster recovery | 70% | YELLOW (email alerts live; add SMS) |
| 17 | Legal, insurance, tax, licensing | 45% | **RED (R9 insurance)**; sales tax registered |
| 18 | Flowers add-on | 50% | **RED** — ON for beta; live prices failing (System 17) |

---

# 2. Business model review

## 2.1 The model as built

1. Shopper installs the Chrome extension, shops normally at Amazon (or 9 other retailers), and opts in to Wrrapd at the cart.
2. Shopper enters the **giftee's ZIP**; only the 34 Duval ZIPs proceed.
3. Shopper chooses wrap (standard $6.99, AI design +$2.99, upload design +$1.99), message, optional flowers (~$17.99), and gets the $0.99 box charge for loose items.
4. Shopper pays **Wrrapd** on `pay.wrrapd.com` (Helcim) and then pays the **retailer** separately, with the ship-to locked to the Wrrapd hub.
5. Retailer ships to the hub. A JoyRider (or WrapRider) collects from the PO Box/hub.
6. A WrapStar wraps on video (or the WrapRider does), prints/attaches a signed QR label.
7. JoyRider/WrapRider delivers to the giftee on the retailer date + 1 day, with a door photo.
8. Contractors are paid hourly by ZIP weekly via Stripe Connect; 1099s annually.

## 2.2 What is smart about it

- **No inventory risk.** The retailer carries the product; Wrrapd only touches it for a day.
- **Asset-light local footprint.** One PO Box/micro-hub plus home-based wrappers can cover a metro.
- **Gift-presentation premium.** Retailer gift wrap (where it exists) is poor; Wrrapd's video-documented, hand-delivered wrap is a real step up.
- **Duval-only beta** keeps the delivery radius drivable by one person.

## 2.3 Business-judgment concerns (please read)

**A. Delivery is the expensive part, and it is currently free.**
Rough per-order cost at the placeholder $30/hour contractor rate (estimates, not accounting):

| Cost item | Estimate per single-gift order |
|---|---|
| Wrapping labor (1/12 hour at $30) | ~$2.50 |
| Paper, tape, tissue, box, label | ~$1.00–$2.00 |
| Delivery labor (15 min stop + ~20–30 min drive in Duval at $30/hr) | ~$17–$22 |
| PO Box run share | ~$1–$3 |
| Card processing (~3% + $0.30) | ~$0.55 |
| **Total cost** | **~$22–$30** |
| **Revenue (wrap $6.99 + box $0.99)** | **~$8** |

While Roger is the WrapRider, labor is founder time and this is fine for learning. **Before paying contractors to deliver, choose one:** a delivery fee (e.g., a flat local delivery fee), a minimum order, scheduled delivery days per ZIP cluster (batching 6–10 stops per route), or a premium price for same-day/hand delivery. The data from the beta (stops per hour, gifts per stop) should drive this decision. Do not publish any of these numbers until decided.

**B. Independent-contractor classification risk.** Paying hourly, setting schedules/availability windows, requiring a video-recorded process, and potentially supplying equipment are all factors that push toward "employee" under IRS and Florida tests. This does not mean "don't do it" — it means have Florida employment counsel review the WrapStar/JoyRider/WrapRider structure **before the first non-founder hire**, especially the hourly model and equipment (§5).

**C. Retailer dependency.** The extension automates checkout pages and rewrites ship-to addresses. Amazon can change its pages any day (fragility) or object to the practice (policy risk). The Terms already shift account risk to shoppers. Keep `docs/ALTERNATIVE-EXTERNAL-FLOW.md` (wrap ordered on wrrapd.com) warm as Plan B.

**D. Capacity of one WrapRider.** Roger alone can realistically handle about **10–15 delivery stops/day** plus one PO Box run, and roughly 30–40 wraps on a wrap-heavy day. The beta needs a **daily order cap** (see Exhibit A, station CAPCOM). Emptying the ZIP allowlist is today's only "kill switch" — it should be tested.

**E. The pay-then-abandon case.** A shopper can pay Wrrapd and then not finish (or cancel) the retailer order. Without inbound package tracking, Roger only discovers this when the package never shows up. Need: "expected by" date per order, a daily "not arrived" report, and a refund SOP.

**F. Gift privacy.** Amazon gift orders hide prices, but packing slips may still contain shopper names and messages. Wrrapd staff see everything. The Code of Conduct should cover confidentiality; giftee address data must be protected.

---

# 3. System-by-system readiness review

Each system lists subsystems, current state, risks, and what must happen before launch. Item IDs (e.g., `EXT-07`) match the checks in Exhibit A.

## System 1 — Shopper website (`wrrapd.com`, WordPress on SiteGround)

| Subsystem | State | Notes |
|---|---|---|
| Homepage, header, seasonal hero, hot gifts | GREEN | Live build `2026-09-22-hire-chrome-gate` / `2026-10-01-amazon-contrast` |
| Extension install CTA (CWS link 3.0.11) | GREEN | Verify link opens the current listing |
| Login / register / Google / Amazon login | YELLOW | Historical fragility (`MOBILE_HEADER_FIX_RUNBOOK.md`); test on mobile + desktop |
| My Orders (`[wrrapd_review_orders]`) | YELLOW | Reads VM JSON via internal API; test with a real claimed order |
| Terms (refund §13 inside Terms) | YELLOW | No standalone refund page; consider a short FAQ link |
| Privacy | **RED-ish** | Apr 23, 2026; says Amazon-only + Stripe. Update for 10 retailers, Helcim, install heartbeat |
| SMS consent / e-comms / affiliate disclosure | GREEN | Pages exist |
| Contact / About | GREEN | Contact hub plugin |
| "How it works" / service area / FAQ | YELLOW | Must say plainly: Jacksonville/Duval only during beta, delivery the day after the retailer delivers |
| SEO/sitemap | GREEN | Sitemap MU present |

## System 2 — Chrome extension (3.0.13 built Oct 3 with retailer order # capture; 3.0.12 submitted Oct 3; 3.0.11 live)

| Subsystem | State | Notes |
|---|---|---|
| Amazon cart opt-in, gift options, hub address swap, Pay Wrrapd, Place Order hook | YELLOW | Most mature; huge DOM automation surface; must be smoke-tested within 24 h of launch and daily |
| Multi-address / mixed carts on Amazon | YELLOW | Historically brittle; recommend telling beta shoppers "one giftee per order" |
| Other 9 retailers (shared flow) | YELLOW | Thin proof; only Best Buy/Kohl's fixture checks. **Decision (Oct 3): all 10 live for beta** → each needs a passing rehearsal order (EXT-19), packing-slip match (HUB-04), and a per-retailer off switch (EXT-20). Best Buy and Walmart are the most likely to refuse post-office addresses — test them first |
| Duval ZIP gate | GREEN | Allowlist API; out-of-area copy is polite |
| Giftee address capture | YELLOW | Amazon scrapes before swap; others collect on pay page. Verify full street + phone reach Command Center |
| Hub address | **YELLOW (R1)** | Street Addressing coded in 3.0.12; carrier tests pending |
| Retailer order # / tracking capture | YELLOW (R2) | Order # read on confirmation pages in 3.0.13 (not yet published); tracking # not captured |
| International Amazon | GREY | Permissions requested but not used — remove to simplify CWS review |
| Install heartbeat | GREEN | Already in `background.js` (the "parked" rule is out of date) |
| Automated tests | GREY | Two fixture scripts only |

## System 3 — Payments & pricing integrity

| Subsystem | State | Notes |
|---|---|---|
| Helcim customer checkout (`/api/checkout-quote` → `/api/helcim-purchase` → `/process-payment`) | YELLOW | Live tokens; confirm account is approved for live settlement, payout bank, statement descriptor |
| Server-side repricing | YELLOW | Works when `pricingCart` sent; drops $0.99 box (bug) |
| Stripe customer checkout routes | YELLOW | Test key; `create-checkout-session` trusts client total — disable or lock down |
| Idempotency / double charge | GREEN | Helcim idempotency key + "already processed" scan |
| Charged but order save failed | RED-ish | Money captured, client sees 500, no auto-refund. Need alert + SOP |
| Refunds | GREEN/YELLOW | Built Oct 3: Command Center refund (Helcim / Stripe), logged on the order, shopper email, webhook; SOP `docs/REFUNDS-SOP.md`. Webhook connected Oct 4. Prove with PAY-01 live $1 refund (Roger, Oct 4) |
| Chargebacks / disputes | GREY | Need evidence packet (wrap video, door photo, timestamps) — depends on R3/R5 |
| Sales tax | GREEN | Registered; annual filer; 7.5% charged on Wrrapd lines |
| PCI scope | GREEN | Helcim.js hosted fields → minimal scope; confirm no card data in logs |

## System 4 — Pay/API server (`wrrapd-server`, PM2 on the GCP VM)

| Subsystem | State | Notes |
|---|---|---|
| Process health | YELLOW | Online, but **153 lifetime restarts** — review why |
| Orders persistence | GREEN/YELLOW (R6) | `orders/order_*.json` on local disk; hourly + nightly backup to GCS since Oct 3; atomic writes for refunds / order refs |
| Tracking ingest to Command Center | YELLOW | If ingest fails, order exists only on the VM. Need retry + alert |
| Emails | YELLOW | SMTP via `mail.wrrapd.com`; no giftee email (correct for surprise gifts) |
| Logs | YELLOW | Full order data (addresses, messages) logged to PM2 logs — trim PII |
| Clutter | YELLOW | `server.js.backup`, `server-priorversion.js`, `temp_qr_*.png`, swap files — remove |
| Python AI helper (`wrrapd-api` on :5000) | GREEN-ish | `debug=True`, listening on 0.0.0.0, but firewall blocks it publicly; still turn debug off |
| `GCS_BUCKET_NAME` mismatch | YELLOW | Env says `wrrapd-user-designs`; code uses `wrrapd-media`. Harmless today; confusing later |
| Valid addresses endpoint | GREY | Stub returning samples — make sure nothing relies on it |

## System 5 — Hub & PO Box inbound logistics

| Subsystem | State | Notes |
|---|---|---|
| Receiving address accepting **all carriers** | **RED (R1)** | See §1.3 and Exhibit B Q1 |
| Daily pickup routine | GREY | No SOP: who, when, keys, counter pickup for oversized, Sunday gaps |
| Package → order matching | YELLOW (R2) | Hub intake search by packing-slip #, Wrrapd #, shopper, giftee, item |
| Intake check-in (scan, photo, condition) | GREEN (R4) | Hub intake: received / partly / damaged / missing + note; no photo yet (wrap video covers condition) |
| Damage / wrong item / missing item | GREY | Agreements require reporting within 24 h; no SOP |
| "Expected but not arrived" report | GREY | Needed to catch abandoned retailer checkouts and carrier delays |
| Secure storage at micro-hub | ? | Locked, climate-OK, camera? (Exhibit B) |
| Returns to retailer | GREY | Terms defer to retailer; need SOP for refused/undeliverable gifts |

## System 6 — Command Center: orders & allocation

| Subsystem | State | Notes |
|---|---|---|
| Ingest → Firestore `orders` | GREEN | |
| Orders board, calendar, order detail | GREEN | |
| Auto-allocation (15 mi) + approval board | GREEN | Solo override via `TRACKING_SOLO_*` for Roger |
| Availability (weekly AM/PM) | GREEN | |
| Inventory calendar (paper / boxes / tissue forecast) | GREEN | Forecast only — no stock levels |
| Reports + daily CSV | GREEN | |
| Pricing + ZIP admin (proxies pay server) | GREEN | |
| Daily capacity cap / pause switch | GREY | Not built; needed for beta (CAPCOM) |
| Inbound package module | GREEN (R4) | `/admin/intake` |
| Admin auth | YELLOW | Shared password, no MFA, no per-person audit trail |
| Firestore rules / indexes | YELLOW | Server uses Admin SDK so rules are bypassed; indexes not versioned |

## System 7 — Wrap operations & video proof

| Subsystem | State | Notes |
|---|---|---|
| Morning sheet email with codes (8 am) | YELLOW | Code exists; **no Cloud Scheduler job** found |
| Shift start/end, scan-to-open | GREEN | |
| Wrap video (MediaRecorder, live chunks, 500 MB/segment) | GREEN/YELLOW (R3) | Bucket `wrrapd-proofs` live; 720p, about 0.9 Mbps (~400 MB/hour) |
| QR label generation for courier | GREEN/YELLOW (R3) | Bucket live; prove one label in rehearsal |
| Label printing | ? | Which printer? (Exhibit B) |
| Pace (12 gifts/hour) and pay cap | GREEN | |
| "Wrap photo" marks order delivered | GREEN (R5) | Fixed Oct 3: wrap photo is saved separately |
| Per-item barcodes / completeness scan | GREY | Documented as later; SOPs and legal already describe it — align wording or build |
| Live wrap viewing | GREY | Deferred (fine) |

## System 8 — Delivery & proof of delivery

| Subsystem | State | Notes |
|---|---|---|
| Courier/WrapRider deliveries list, Start / Mark delivered | GREEN | |
| QR scan shows address, flowers, instructions | GREEN | HMAC-signed |
| Door photo capture in courier/WrapRider UI | GREEN (R5) | Camera + GPS + handed-to name; required before delivered |
| GPS on delivery | YELLOW | API exists, courier UI doesn't send it |
| Route planning / ordering stops | GREY | Use Google Maps multi-stop manually for beta |
| Giftee not home / safe drop / reattempt / refused | GREY | No SOP, no status |
| Signature | GREY | Not needed for beta except high-value (decide threshold) |

## System 9 — Customer communications & service

| Subsystem | State | Notes |
|---|---|---|
| Thank-you email + SMS at order | GREEN | |
| Delivery-choice (combine vs fastest) | GREEN | |
| Public tracking page `/track/[token]` | GREEN | Shows POD photo if present (depends on R3/R5) |
| Out-for-delivery / delivered notification | GREY | Add before public beta — shoppers will ask "did it arrive?" |
| Service desk (Twilio SMS/voice/MMS) | GREEN | Verify Twilio number is A2P 10DLC registered (US carriers block unregistered business SMS) |
| CS playbook / macros | GREY | Write the 12 standard replies (Section 6) |
| Support hours promise | ? | Decide and publish (shopper-friendly wording only) |
| Website chat (Tidio) | YELLOW | Live on wrrapd.com; answered by a person (free plan) |
| AI text assistant | YELLOW | Built and live Oct 3; set `SUPPORT_ALERT_SMS_TO` (Roger's mobile) so handoffs also text him |

**AI text assistant (built Oct 3, live on the Twilio line).** Answers simple questions on its own (order status with tracking link, how Wrrapd works, prices shown at checkout, delivery area and timing, wrap options, flowers, extension help, contractor how-to, application next steps). Everything else — refunds, complaints, damaged/missing/late gifts, order changes, contractor pay, schedule changes, delivery problems, any unknown number asking about an order, or any reply that promises a follow-up — gets a short holding text, an alert to Roger, and a saved AI draft in the Service desk ("Use AI draft"). Code-level rules: order details only go to the shopper's own phone number; no dollar amounts; no refund/cancel language; a person replying pauses the AI on that thread for 12 hours; max 4 AI replies per thread per hour; STOP respected. Switch on/off in Service desk; "Pause AI here" per thread. Test suite: `tracking-platform/scripts/support-ai-eval.mts` (20 scripted conversations). Website chat (Tidio free plan) stays human-answered; free plan has no API to connect.

## System 10 — Contractor hiring & onboarding

| Subsystem | State | Notes |
|---|---|---|
| Apply forms (3 tracks) + fit score | GREEN | `apply.wrrapd.com` live (`2026-09-23-onboarding-step-pager`) |
| Command Center review / interview / move stream / activate | GREEN | |
| `pros.wrrapd.com` onboarding host | YELLOW (R7) | Onboarding works on apply.wrrapd.com; one wp-config line for approval emails (§1.3) |
| Clickwrap agreements | GREEN | Entity name "Wrrapd, Inc." vs LLC still flagged in memos — confirm |
| BoldSign W-9 | YELLOW | Needs template IDs/keys in hire `wp-config.php` |
| Background check | YELLOW | Consent captured; no vendor. For beta: run manually via a vendor account (e.g., Checkr) — drivers need an MVR |
| Identity | YELLOW | Selfie with ID, manual review |
| Insurance certificate upload | YELLOW | Requirement conflicts between agreement and onboarding |
| Payout setup | GREEN/YELLOW | Stripe Connect works on Cloud Run; WordPress steps still say "later" for JoyRider/WrapRider |
| Sensitive documents storage (IDs, licenses, COIs) | ? | Confirm they are not in a public `wp-content/uploads` path |

## System 11 — Contractor pay, payouts, 1099

| Subsystem | State | Notes |
|---|---|---|
| Hourly rates by ZIP (3 roles) | YELLOW | Defaults are $30 placeholders — set real rates before first hire |
| Weekly pay calculation from shifts + route estimate | GREEN | |
| Manual / Automatic Thursday payouts | GREEN | Scheduler `wrrapd-weekly-payouts` (Thu 18:00 UTC) enabled |
| Stripe Connect live | GREEN | Live key on Cloud Run; fund the platform balance before first payout |
| Holds, wallets | GREEN | |
| Annual statements / 1099-NEC | YELLOW | Internal statements; IRS filing still needs a filing service (e.g., Stripe 1099 or Track1099) |

## System 12 — Hardware, kits & supplies

**State: GREY — nothing exists beyond a supplies forecast.** Full program and module spec in §5. Must exist before the first non-founder contractor starts.

## System 13 — Data, media & architecture

See §4 for the full analysis. Summary: two sources of truth (VM JSON + Firestore), no backups, no PITR, missing storage bucket, no video lifecycle, no bitrate cap.

## System 14 — Security & privacy

| Subsystem | State | Notes |
|---|---|---|
| Secrets | YELLOW | `.env` + PM2 dump; Cloud Run env vars in plain service config. Move to Secret Manager over time |
| Google Maps key in `public/checkout.html` | YELLOW | Normal for browser keys — restrict by HTTP referrer + API in Google Cloud console |
| CORS allow-all, no rate limiting, no helmet | YELLOW | Add rate limits on pay, upload, AI-generate endpoints (cost abuse) |
| Unauthenticated ingest proxy | YELLOW | Add shared secret |
| Admin auth | YELLOW | Per-person logins + MFA, or Google Identity-Aware Proxy in front of `/admin` |
| VM firewall | YELLOW | SSH open to 0.0.0.0/0 (IAP rule already exists — use it only); delete RDP 3389 rule |
| PII in logs | YELLOW | Trim |
| Giftee/shopper data retention | GREY | Define (e.g., delete addresses/messages 24 months after delivery) |

## System 15 — Monitoring, backup & disaster recovery

| Subsystem | State | Notes |
|---|---|---|
| Uptime checks | **RED** | None. Add Cloud Monitoring uptime checks for `api.wrrapd.com/health`, `pay.wrrapd.com/checkout`, Cloud Run, `wrrapd.com` |
| Alerting | **RED** | None. Alert Roger by SMS/email on downtime, 5xx spikes, failed ingest, failed payouts |
| Error tracking | GREY | Sentry (free tier) on pay server + Command Center |
| VM orders backup | **RED** | Cron to GCS nightly (or every hour) |
| Firestore | **RED** | Turn on PITR (7 days) + delete protection + daily backup schedule |
| Media bucket | YELLOW | Soft delete 7 days on; no versioning, no lifecycle |
| Restore drill | GREY | Do one before launch |
| Golden rollback | GREEN | Tags exist; documented |

## System 16 — Legal, insurance, tax, licensing

| Subsystem | State | Notes |
|---|---|---|
| Entity (Wrrapd, Inc. on Sunbiz, C corporation), EIN, bank | GREEN | Resale certificate on file; fix any leftover "LLC" wording |
| Local business tax receipts (City of Jacksonville / Duval) | ? | Needed for operating in Duval |
| Florida sales tax registration & taxability | GREEN | Registered; annual filer; 2026 resale certificate on file |
| Insurance: general liability, bailee/inland marine (customer goods), hired & non-owned auto, cyber | **RED (R9)** | Broker |
| Contractor classification review | YELLOW | Before first hire (§2.3 B) |
| Shopper Terms + Privacy | YELLOW | Privacy update |
| Patent | YELLOW | Provisional kit prepared; confirm filed before public launch (public use/disclosure starts the clock) |
| Trademark "Wrrapd", "WrapStar", "JoyRider", "WrapRider" | ? | Consider filing |

## System 17 — Flowers add-on (ON for beta — decision Oct 3)

How it works (`WrrapdServer/lib/flowers/`): giftee ZIP → nearest Publix + Sam's Club → fetch bouquet prices → Grok picks 4–8 → shopper sees "Bouquet #N" at **retail + markup**; the server re-validates the chosen offer at payment. Target is paused as a floral supplier.

Audit on Oct 3 (live calls for 32218, 32256, 32207, 32250):

| Check | Finding | Status |
|---|---|---|
| Markup | Was **$1.49**, now **$2.00** (`scrape.js` `MARKUP`) — deployed Oct 3 | GREEN |
| Live Publix prices | **Every request returns HTTP 403** (Publix blocks our server) | **RED** |
| Live Sam's Club prices | **Bot wall (HTTP 412)** every request | **RED** |
| What shoppers actually saw | Hard-coded backup price lists (Publix $9.99–$16.49, Sam's $12.98–$19.76) **labeled as "live"**, no photo disclaimer | Fixed Oct 3: now labeled `fallback_prices` with "Actual bouquets might differ slightly from the photos shown." |
| Backup Publix photos | Point at **Sam's Club** image URLs | YELLOW — replace with real Publix photos or Wrrapd's own |
| Offer survives server restart | Was memory-only → "price mismatch or expired" at payment after any PM2 restart | Fixed Oct 3: offers saved to `data/flower-offers.json` (48 h) |
| Purchase practicality | Sam's requires a membership; Sam's at **300 Busch Dr** is next to the PO Box (150 Busch Dr) | Note |

**Recommendation (pick one before beta):**
1. **Weekly price list in Command Center** (recommended): Roger enters current in-store bouquet prices + photos each week (he buys them anyway); server serves those + $2.00. Reliable, honest, no bot walls.
2. Paid scraping proxy (residential IPs) to keep automated prices — ongoing cost, still fragile, retailer terms risk.
3. Keep stored price list (today's behavior) — prices drift; margin risk if store prices rise above the stored price.

Ops risks to cover in SOPs: perishability (buy same day as delivery), substitution rule when the exact bouquet is out of stock (equal or better, never cheaper-looking), receipt photo on the order.

---

# 4. The architecture question — "Will we hit an Uber-style wall?"

## 4.1 What actually happened to Uber (short version)

Uber's early pain came from **one big application writing everything into one central relational database**, at a scale of millions of trips plus a GPS ping from every driver every few seconds. The database became the bottleneck, and splitting it apart later was very expensive. The lesson is not "LAMP is bad"; it is: **don't let everything depend on one database and one server, and never put heavy files (images, video) inside the database.**

## 4.2 Where Wrrapd actually stands

| Concern | Wrrapd today | Verdict |
|---|---|---|
| Is the order system LAMP? | No. WordPress (LAMP on SiteGround) holds marketing, shopper accounts, and the hire funnel. Orders live in **Firestore** (Google-managed, scales automatically) plus JSON files on the VM. | Good direction |
| Are videos/images in a database? | No. They go to Cloud Storage; the database stores a link. | **Correct — this is the key decision** |
| Volume risk in Jacksonville | Even 500 orders/day is tiny for Firestore. | Not a near-term risk |
| **Real risk 1 — two sources of truth** | Pay server writes VM JSON first, then forwards to Firestore. If forwarding fails, the two disagree. | **Fix now** |
| **Real risk 2 — single VM** | Pay server, order files, and AI helper on one machine; no backup. | **Fix now (backups), migrate later** |
| **Real risk 3 — video upload size** | No bitrate cap → roughly 1 GB per recorded hour. On a phone's cellular connection this fails or burns data plans. | **Fix now (cap)** |
| **Real risk 4 — no retention policy** | Videos kept forever by default. | Fix now (lifecycle) |
| Real risk 5 — sensitive hire documents on shared WordPress hosting | Driver licenses, ID selfies, COIs | Verify and harden |
| Real risk 6 — money ledger in a document database | Payouts/earnings in Firestore without transactions across collections | Acceptable for beta; move ledger to Postgres when volume grows |

## 4.3 Media math (so the risk is sized, not feared)

Assumptions: 720p browser recording at default ~2.5 Mbps ≈ 19 MB/minute; ~5 minutes of video per gift (12 gifts/hour); one door photo ~3 MB.

| Scenario | Video per day | Per month | Storage cost per month (Standard, approximate) |
|---|---|---|---|
| Beta: 15 gifts/day | ~1.4 GB | ~43 GB | ~$1 |
| Holiday: 100 gifts/day | ~9.5 GB | ~285 GB | ~$6 (grows each month if never deleted) |
| Multi-city: 2,000 gifts/day | ~190 GB | ~5.7 TB | ~$120+ (grows each month) |

With a **1 Mbps cap** (still clear for proof) and a **lifecycle** (move to Nearline at 30 days, Coldline at 90, delete at 13 months unless the order has an open dispute), storage costs stay small even at multi-city scale. The real costs are **upload bandwidth on contractors' phones** and **download (egress)** if customers stream videos — keep customer-facing video short (a 15-second "reveal" clip) and stream the full proof only to Command Center.

## 4.4 Target architecture by stage

**Stage 1 — before public beta (Oct 5–25):**
1. Make **Firestore the system of record for orders.** The pay server writes the order to Firestore (via ingest) as part of `/process-payment`, retries with backoff if it fails, and raises an alert on failure. VM JSON becomes a local journal/backup.
2. Nightly (better: hourly) `gsutil rsync` of `orders/` and `customers/` to a versioned GCS bucket.
3. Firestore: enable **PITR**, **delete protection**, **daily backup schedule** (retain 14+ days).
4. Create a dedicated media bucket (e.g., `wrrapd-proof`), set `FIREBASE_STORAGE_BUCKET` on Cloud Run, uniform access, no public listing, versioning on, lifecycle rules for `proof/` and `shift-video/`.
5. Cap `MediaRecorder` at ~1 Mbps / 720p; require Wi-Fi for full upload; keep live chunks small.
6. Server-side ZIP enforcement, box-charge fix, ingest proxy secret, rate limiting.
7. Uptime checks + alerts + Sentry.

**Stage 2 — January–March 2027 (after holidays):**
1. Move the pay server to **Cloud Run** (stateless, auto-restart, no single VM). Nothing local on disk.
2. **Secret Manager** for all keys.
3. Move money (earnings, payouts, refunds) to **Cloud SQL Postgres** with real transactions; keep Firestore for live operational state.
4. Daily export to **BigQuery** for reporting (orders, stops/hour, margins).
5. Per-person admin accounts with MFA / Identity-Aware Proxy.

**Stage 3 — second city and beyond:**
1. Event-driven order lifecycle (Pub/Sub topics: order.paid, package.received, wrap.done, delivered).
2. Media pipeline: transcode to H.264 480p/720p (Transcoder API), thumbnails, short-lived signed URLs, Cloud CDN for customer clips.
3. `cityId`/`hubId` on every record; per-city hub addresses, ZIP sets, rates, and capacity.
4. Contractor native apps (Capacitor shells already exist) with background upload and offline queueing.

---

# 5. Hardware & kit program + Command Center Equipment module

## 5.1 Decide the policy first (counsel input — see §2.3 B)

Three options, from least to most employee-like:
1. **Contractor buys from a recommended list** (Wrrapd provides only branded consumables: labels, stickers, tags). Lowest classification risk.
2. **Wrrapd sells or rents a starter kit** at cost, deducted from early payouts, owned by the contractor after N weeks.
3. **Wrrapd lends a kit** with a signed equipment agreement and a deposit, returned on deactivation.

**Decision (Oct 3): option 3 — contractors borrow a Wrrapd kit and return it.** Requirements that follow: a signed equipment loan acknowledgment (counsel to draft; note that supplying equipment is a factor in contractor-vs-employee tests), serialized asset tags, a return checklist and return shipping on deactivation, a lost/damaged policy, and the Command Center Equipment module (§5.3) with the return flow — all before the first non-founder contractor starts. Roger's first purchased item — a **portable Bluetooth mini thermal label printer** (AliExpress, Black Standard Set, arriving Oct 9–15) — is registered as asset #1 when it arrives.

## 5.2 Kit contents by role (starting proposal — validate with Roger's own setup)

| Item | WrapStar | JoyRider | WrapRider | Notes |
|---|---|---|---|---|
| Smartphone (contractor-owned) | ✔ | ✔ | ✔ | Minimum OS version; camera + data |
| Overhead phone/camera mount or tripod | ✔ | | ✔ | For the table-view wrap video |
| LED light (ring/panel) | ✔ | | ✔ | Video quality = proof quality |
| Mini Bluetooth thermal label printer (model bought Oct 3; prints from a phone app) | ✔ | | ✔ | Use: tag each received package and each finished gift with the Wrrapd order number (matches the packing-slip decision). Small inkless labels only — **not** for 4×6 shipping labels. Test fade/heat in a hot car before standardizing; keep one model fleet-wide |
| Labels (Wrrapd-supplied) | ✔ | | ✔ | Signed QR label per box |
| Scissors, cutter, tape dispenser, double-sided tape | ✔ | | ✔ | |
| Paper, tissue, ribbon, boxes | ✔ | | ✔ | Supplied per policy; forecast in Inventory calendar |
| Branded gift tags / message cards / seal stickers | ✔ | | ✔ | Wrrapd-supplied |
| Tamper-evident bags or seal stickers | ✔ | ✔ | ✔ | Chain of custody between hops |
| Delivery tote / crate, protective blanket | | ✔ | ✔ | Prevents crushed wraps |
| Insulated bag | | ✔ | ✔ | Only if flowers are on |
| Phone car mount + charger | | ✔ | ✔ | |
| Hub/PO Box key or access card | | ✔ | ✔ | **Serialized and tracked** |
| Wrrapd ID badge / lanyard / shirt | | ✔ | ✔ | Giftee trust at the door |

## 5.3 Command Center "Equipment & Kits" module — specification

New admin route `/admin/equipment`, new Firestore collections, and a tab on each contractor detail page.

**Collections**
- `tracking_equipment_items` — catalog: SKU, name, category (tool / consumable / access / apparel), unit cost, serialized yes/no, reorder point, supplier, photo.
- `tracking_equipment_assets` — one doc per serialized unit: asset tag, serial number, status (`in_stock`, `assigned`, `in_transit`, `returned`, `lost`, `damaged`, `retired`), current holder (contractor ID + role), condition notes, purchase date.
- `tracking_kit_shipments` — per shipment: contractor, kit template, line items (SKU, qty, asset tags), carrier, tracking number, shipped/delivered dates, delivery confirmation photo, contractor "received and accepted" e-acknowledgment (timestamp + IP), cost.
- `tracking_supply_stock` — consumable stock by location (hub, each contractor): on hand, reserved by upcoming orders (from the Inventory forecast), reorder alerts.
- `tracking_equipment_events` — immutable audit log of every assignment, shipment, return, loss.

**Screens & flows**
1. **Kit templates** per role (WrapStar, JoyRider, WrapRider) from §5.2.
2. **On Activate** (applications page): prompt "Ship starter kit?" → creates a shipment draft from the template.
3. **Ship**: enter carrier + tracking → status `in_transit`; contractor gets email/SMS with tracking.
4. **Receive**: contractor confirms in their app (photo of kit + checkbox), status `assigned`. Activation for live shifts can require "kit received".
5. **Replenishment**: Inventory forecast (already built) minus contractor stock → suggested supply shipment each Friday.
6. **Return on deactivation**: return label, checklist, deposit/charge-back per policy, assets back to `in_stock` or `lost`.
7. **Reports**: assets by holder, outstanding returns, cost per contractor, consumables per gift (feeds unit economics).
8. **Access control assets** (hub keys, PO Box keys): flagged high-security; loss triggers an alert and a lock change task.

**Legal tie-in**: equipment acknowledgment text in the contractor agreement suite (counsel to draft); no dollar amounts in public copy.

---

# 6. SOPs — what exists, what must be written before launch

**Exist** (`docs/sop/`): WrapStar live wrap; JoyRider scans & delivery; WrapRider wrap & deliver; sick coverage.

**Must be written before public beta** (short, one page each; Roger as first user):

| # | SOP | Key contents |
|---|---|---|
| SOP-01 | Hub/PO Box daily pickup | Times, keys, counter pickup for oversized, Sunday/holiday gaps, photo of haul |
| SOP-02 | Package intake & matching | Photo each label + packing slip, match to Wrrapd order, mark received, quarantine unknowns |
| SOP-03 | Damaged / wrong / missing item | Photo, notify shopper same day, retailer replacement/return path, refund rules |
| SOP-04 | Package not arrived by expected date | Day+1 check, contact shopper, hold/refund decision |
| SOP-05 | Shopper paid Wrrapd but retailer order never placed/cancelled | Detection, contact, refund in Helcim, mark order cancelled |
| SOP-06 | Delivery exceptions | Giftee not home, safe-drop rules, reattempt, gated communities/apartments, refused gift, wrong address |
| SOP-07 | High-value items | Threshold (decide), signature or hand-to-person only, no safe-drop |
| SOP-08 | Refunds & cancellations | Who approves, Helcim steps, log on order, customer wording |
| SOP-09 | Chargeback response | Evidence packet: order, wrap video, door photo, GPS, messages |
| SOP-10 | Customer service macros | 12 standard replies (where is my gift, change address, change message, cancel, damaged, late, refund, out of area, etc.) |
| SOP-11 | Daily open / close (Flight Director checklist) | See Exhibit A §A.6 |
| SOP-12 | Incident response | Site down, payment down, data leak, vehicle accident, theft — who to call |
| SOP-13 | Holiday surge | Order cutoffs, extra pickup runs, overflow storage, backup contractors |
| SOP-14 | Returns to retailer / undeliverable gifts | Hold period, return shipping, shopper communication |
| SOP-15 | Contractor kit shipping & returns | From §5 |

---

# 7. Timeline

All dates 2026 unless noted. Owners: **R** = Roger, **Eng** = engineering (agent/developer), **CPA**, **Broker**, **Counsel**.

### Phase 0 — Decide (Sat Oct 3 – Sun Oct 4)
- R: answer Exhibit B questions (hub address, insurance, tax, pricing, retailers in beta).
- R: book CPA (sales tax), insurance broker, and (for later hires) Florida employment counsel.

### Phase 1 — Stabilize (Mon Oct 5 – Sun Oct 11) — "close the REDs"
- Eng: R3 storage bucket + video cap + lifecycle; R6 backups + Firestore PITR/delete protection/backup schedule.
- Eng: R5 door photo + GPS in courier/WrapRider UI; stop wrap photo from setting `delivered`.
- Eng: R2 capture retailer order number (and tracking number where shown) at each of the 10 retailers' confirmation pages and add it to the Wrrapd order; Command Center intake search by retailer order number. (Decision Oct 3: no Wrrapd code on the label.)
- Eng: R1 hub address switched to 150 BUSCH DR #26067, JACKSONVILLE FL 32218 — extension 3.0.12 (done Oct 3; publish to the Chrome Web Store).
- Eng: per-retailer on/off switch, since all 10 retailers launch together (decision Oct 3).
- Eng: server-side ZIP check, $0.99 box fix, ingest proxy secret, disable Stripe test customer routes.
- Eng: schedule the 8 am morning-sheet cron and expire-delivery-preferences cron.
- Eng: uptime checks + alert to Roger's phone; Sentry.
- R: `pros.wrrapd.com` pointed at hire WordPress (R7).
- R/Broker: insurance bound (R9).

### Phase 2 — Dress rehearsals (Mon Oct 12 – Sun Oct 18)
- 10 real orders, bought by Roger/team with real cards, to friends at 10 different Duval ZIPs, mixed: single item, 2 items one giftee, loose item needing box, AI design, upload design, one Target, one LEGO.
- Run every step with the SOPs and the Exhibit A checklist. Log every glitch.
- Deliberately test failures: card decline, out-of-area ZIP, abandon retailer checkout after paying Wrrapd, damaged package, giftee not home, refund.
- Restore drill: restore yesterday's Firestore backup into a test database; restore VM orders from GCS.

### Phase 3 — Friends & family closed beta (Mon Oct 19 – Sun Nov 1)
- 15–30 invited shoppers; cap 5 orders/day; flowers OFF; all 10 retailers that passed rehearsal (EXT-19).
- Daily 15-minute review: orders, failures, time per wrap, time per stop, cost per order.
- Privacy policy updated; how-it-works/FAQ updated with service area + timing.
- Begin recruiting 1–2 backup WrapRiders/JoyRiders (now that `pros` works).
- Fri Oct 30: **Go/No-Go poll** (Exhibit A §A.5).

### Phase 4 — Public Duval beta (Mon Nov 2 → )
- Announce locally (social, neighborhood groups, local businesses). Cap starts at 10/day; raise in steps of 5 when two consecutive days run clean.
- First backup contractor trained and shadowing by Nov 15; kit shipped through the Equipment module.
- Pricing/delivery-fee decision using real data by Nov 16.

### Phase 5 — Holiday peak (Fri Nov 27 – Thu Dec 24)
- Black Friday Nov 27, Cyber Monday Nov 30.
- Publish (shopper-friendly) holiday cutoff: suggest **order by Sat Dec 19** for Christmas Eve delivery when the retailer promises arrival by Tue Dec 22; tighten if data says otherwise.
- Extra PO Box/hub runs daily; overflow storage plan; second hub pickup person.
- Daily checklist (Exhibit A §A.6) every morning, no exceptions.

### Phase 6 — Review & scale (Jan 4 – Mar 2027)
- Post-mortem; unit economics; Stage 2 architecture (§4.4); decide second ZIP cluster or city.

---

# Exhibit A — Master Pre-Launch Checklist: "All Systems — Go/No-Go"

Modeled on a launch-control poll. Each **station** owns a system. Each line is a check with a **pass criterion**. Every check is done twice: **1st** by the person doing it, **2nd** by a different person or on a different day/device ("double-check"). A station reports **GO** only when all its checks pass twice or have a written waiver signed off by the Flight Director (Roger).

Columns: `ID` · Check · How to verify · Pass criterion · 1st ☐ · 2nd ☐

### Stations (call signs)

| Call sign | System | Station lead |
|---|---|---|
| FLIGHT | Overall go/no-go, waivers, abort calls | Roger |
| BOOSTER | Shopper website `wrrapd.com` | |
| GUIDANCE | Chrome extension | |
| FIDO | Payments, pricing, tax | |
| INCO | Pay/API server + integrations | |
| GROUND | Hub / PO Box / inbound | Roger |
| CAPCOM | Command Center orders, allocation, capacity | |
| WRAP | Wrap operations & video | Roger |
| RECOVERY | Delivery & proof of delivery | Roger |
| COMMS | Customer notifications & service desk | |
| CREW | Contractor hiring, onboarding, pay | |
| SUPPLY | Hardware, kits, consumables | |
| DATA | Data, media, backups, restore | |
| SECURITY | Security & privacy | |
| SURGEON | Monitoring & incident response | |
| LEGAL | Legal, insurance, tax, licensing | |

---

## A.1 BOOSTER — Shopper website

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| WEB-01 | Homepage loads, desktop Chrome | Incognito, cold cache | < 3 s, no console errors, correct build string in view-source | ☐ | ☐ |
| WEB-02 | Homepage loads, iPhone Safari + Android Chrome | Real devices | Header, logo left, hamburger works, no overlap | ☐ | ☐ |
| WEB-03 | Install CTA opens current CWS listing | Click | Listing shows 3.0.12+ | ☐ | ☐ |
| WEB-04 | CTA hidden after install | Install extension, reload | Install buttons hidden | ☐ | ☐ |
| WEB-05 | Register / login / password reset | New email, end-to-end | Email arrives < 2 min, login works | ☐ | ☐ |
| WEB-06 | Google + Amazon login | Real accounts | Lands logged-in, gold buttons, no plugin blue | ☐ | ☐ |
| WEB-07 | My Orders shows a claimed order | Place test order with same email, log in | Order listed with correct status | ☐ | ☐ |
| WEB-08 | Terms page current, refund section readable | Read | Matches actual refund practice | ☐ | ☐ |
| WEB-09 | Privacy page updated (10 retailers, Helcim, heartbeat) | Read | "Last updated" ≥ Oct 2026; matches CWS privacy form | ☐ | ☐ |
| WEB-10 | Service-area + timing statement visible | Read how-it-works/FAQ | Says Jacksonville/Duval only; delivered after the retailer delivers | ☐ | ☐ |
| WEB-11 | Contact page works | Submit form + email + phone | Reaches support within 5 min | ☐ | ☐ |
| WEB-12 | No dollar amounts for contractor pay on any public page | Search site | Zero hits | ☐ | ☐ |
| WEB-13 | Colors: gold `#f6b933`, navy `#0c0638`, no neon/blue buttons | Visual pass | Pass | ☐ | ☐ |
| WEB-14 | W3 cache purged after last MU deploy | View-source build marker | Matches repo `WRRAPD_MU_BUILD` | ☐ | ☐ |
| WEB-15 | SSL valid on all hosts | `curl -vI` | Valid ≥ 30 days | ☐ | ☐ |

## A.2 GUIDANCE — Chrome extension

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| EXT-01 | CWS published version = repo `manifest.json` | CWS dashboard | Same version | ☐ | ☐ |
| EXT-02 | Fresh install from CWS on a clean Chrome profile | New profile | Installs, no errors in service worker | ☐ | ☐ |
| EXT-03 | Amazon: opt-in appears on cart | Real cart | Yes/No visible, default No | ☐ | ☐ |
| EXT-04 | Duval ZIP accepted (test 5 ZIPs incl. 32202, 32226, 32250, 32258, 32277) | Enter ZIP | Proceeds | ☐ | ☐ |
| EXT-05 | Out-of-area ZIP refused (32073 Clay, 32092 St. Johns, 32034 Nassau, 33602 Tampa) | Enter ZIP | Polite refusal, no payment possible | ☐ | ☐ |
| EXT-06 | Wrap choices + prices correct (standard, AI, upload, box) | Compare with Command Center pricing | Exact match | ☐ | ☐ |
| EXT-07 | AI design generates and saves | Generate | Image saved, appears on order | ☐ | ☐ |
| EXT-08 | Upload design ≤ 5 MB saves | Upload | Saved, appears on order | ☐ | ☐ |
| EXT-09 | Gift message saved exactly (emoji, apostrophes, 250 chars) | Compare in Command Center | Exact | ☐ | ☐ |
| EXT-10 | Giftee full address + phone reach Command Center | Order detail | Complete and correct | ☐ | ☐ |
| EXT-11 | Ship-to swapped to hub USPS Street Addressing address and locked | Each retailer's checkout page | Hub address selected and accepted (no PO Box error) | ☐ | ☐ |
| EXT-12 | Place Order blocked until Wrrapd paid | Try to place first | Blocked with clear message | ☐ | ☐ |
| EXT-13 | Place Order released after payment | Pay, then place | Retailer order placed | ☐ | ☐ |
| EXT-14 | Retailer order number captured on confirmation page | Command Center order | Retailer order # present | ☐ | ☐ |
| EXT-15 | Multi-item cart, one giftee | 2 items | Both items on Wrrapd order, one delivery | ☐ | ☐ |
| EXT-16 | Mixed cart (some wrapped, some not) | 3 items, wrap 1 | Only wrapped item goes to hub; others ship to shopper (or blocked by policy) | ☐ | ☐ |
| EXT-17 | Amazon delivery date captured, Wrrapd date = +1 day | Compare | Correct, not in the past | ☐ | ☐ |
| EXT-18 | Pickup-only / digital items refused | Add gift card / pickup item | Not offered | ☐ | ☐ |
| EXT-19 | All 10 retailers (Amazon, Target, LEGO, Ulta, Walmart, Nordstrom, Kohl's, Sephora, Best Buy, Etsy) each repeat EXT-03 → EXT-17 with one real rehearsal order | Per retailer | Pass, or that retailer switched off until it passes | ☐ | ☐ |
| EXT-20 | Per-retailer off switch works | Toggle one retailer | Wrrapd UI disappears on that retailer only | ☐ | ☐ |
| EXT-21 | Kill switch works (empty allowlist or flag) | Toggle in Command Center | All ZIPs refused within 5 min; restore works | ☐ | ☐ |
| EXT-22 | Windows build reproducible (`npm run build`) | Roger's Windows clone | Bundles identical to CWS zip | ☐ | ☐ |
| EXT-23 | Daily Amazon smoke test assigned | Calendar | Owner + time set through Dec 24 | ☐ | ☐ |

## A.3 FIDO — Payments, pricing, tax

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| PAY-01 | Helcim live end-to-end (never tested as of Oct 3) | Roger buys one real order with his own card, then refunds it | Charge appears, refund lands, deposit reaches the bank | ☐ | ☐ |
| PAY-01b | Flower price shown = price charged = store price + $2.00 | Order with flowers; compare to the store shelf | Exact | ☐ | ☐ |
| PAY-01c | Flower order still pays after a server restart mid-checkout | Pick bouquet → `pm2 restart` → pay | Payment succeeds | ☐ | ☐ |
| PAY-02 | Statement descriptor reads "WRRAPD" | Real card statement | Recognizable name (reduces chargebacks) | ☐ | ☐ |
| PAY-03 | Server total = shopper-displayed total (all wrap types + box + tax) | 6 test carts | Exact to the cent | ☐ | ☐ |
| PAY-04 | Tampered client total is ignored | Edit total in devtools | Server charges correct price | ☐ | ☐ |
| PAY-05 | Out-of-area ZIP refused **by the server** | Direct API call | 400, no charge | ☐ | ☐ |
| PAY-06 | Card decline handled | Decline test card / low-limit card | Friendly message, no order created | ☐ | ☐ |
| PAY-07 | Double-click Pay does not double-charge | Rapid clicks | One charge | ☐ | ☐ |
| PAY-08 | Charge succeeded but save failed → alert | Simulate (disk full / ingest down in staging) | Roger alerted within 5 min | ☐ | ☐ |
| PAY-09 | Refund full and partial in Helcim; logged on order | Do one each | Shopper sees refund; order marked | ☐ | ☐ |
| PAY-10 | Stripe customer (test-mode) routes disabled or locked | Call endpoints | Refused | ☐ | ☐ |
| PAY-11 | Sales tax: registered with Florida DOR (or tax removed) | Certificate / config | Matches CPA decision | ☐ | ☐ |
| PAY-12 | Tax rate correct for Duval (6% + 1.5% surtax) | Checkout | 7.5% on taxable lines only | ☐ | ☐ |
| PAY-13 | No card numbers in any log | Grep logs | Zero | ☐ | ☐ |
| PAY-14 | Receipt email shows correct amounts and support contact | Test order | Correct | ☐ | ☐ |

## A.4 INCO — Pay/API server & integrations

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| API-01 | `/health` OK from outside | `curl https://api.wrrapd.com/health` | 200 | ☐ | ☐ |
| API-02 | PM2 restart cause understood; no restarts in last 7 days | `pm2 describe wrrapd-server`, logs | 0 unexplained restarts | ☐ | ☐ |
| API-03 | PM2 resurrects after VM reboot | Reboot in a quiet window | Both processes back online | ☐ | ☐ |
| API-04 | Every paid order lands in Firestore | Compare VM order count vs Firestore for test week | 100% match | ☐ | ☐ |
| API-05 | Ingest retry works when Cloud Run is down | Simulate | Order arrives after recovery | ☐ | ☐ |
| API-06 | Ingest proxy requires a secret | Call without header | 401 | ☐ | ☐ |
| API-07 | Rate limiting on pay, upload, AI endpoints | Burst test | 429 after limit | ☐ | ☐ |
| API-08 | PII trimmed from logs | Read last 200 lines | No full addresses/messages | ☐ | ☐ |
| API-09 | Stray files removed (`*.backup`, `server-priorversion.js`, `temp_qr_*`, swap files) | `ls` | Clean | ☐ | ☐ |
| API-10 | Flask helper `debug=False`, bound to 127.0.0.1 | Config | Pass | ☐ | ☐ |
| API-11 | Disk space alert at 80% | Monitoring | Alert configured | ☐ | ☐ |
| API-12 | SMTP sending: SPF, DKIM, DMARC pass for `wrrapd.com` | mail-tester.com | Score ≥ 9/10, not in spam (Gmail + Outlook + iCloud) | ☐ | ☐ |
| API-13 | Twilio number A2P 10DLC registered | Twilio console | Approved campaign (Roger confirmed Oct 3) | ☑ | ☐ |

## A.5 GROUND — Hub / PO Box / inbound packages

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| HUB-01 | Receiving address accepts USPS, UPS, FedEx, Amazon Logistics, OnTrac | Send one test shipment via each | All 5 arrive | ☐ | ☐ |
| HUB-02 | Amazon accepts the hub address for a typical gift (non-USPS item) | Amazon checkout | No "cannot ship to PO Box" error | ☐ | ☐ |
| HUB-03 | Address in extension = verified address | Compare | Exact | ☐ | ☐ |
| HUB-04 | Packing slip from each of the 10 retailers shows an order number that matches the captured retailer order # | One test order per retailer | 10/10 match, or a written fallback for retailers without slips | ☐ | ☐ |
| HUB-05 | Pickup schedule set (days/times, incl. Saturday) and in calendar | Calendar | Set through Dec 31 | ☐ | ☐ |
| HUB-06 | Keys/access: 2 copies, logged in Equipment module | Count | 2, logged | ☐ | ☐ |
| HUB-07 | Oversized/signature-required package procedure known | Ask post office / receiving desk | Written in SOP-01 | ☐ | ☐ |
| HUB-08 | Intake: each package photographed and matched to order within 2 h of pickup | Dry run | 100% matched or quarantined | ☐ | ☐ |
| HUB-09 | "Expected but not arrived" list reviewed daily | Command Center report / sheet | Exists and used | ☐ | ☐ |
| HUB-10 | Held packages stored dry and secure at Roger's wrap location (the PO Box is the only hub) | Inspect | Pass; unboxing on wrap video covers custody | ☐ | ☐ |
| HUB-11 | Damaged-on-arrival flow rehearsed | Simulate | Shopper notified same day | ☐ | ☐ |
| HUB-12 | Holiday overflow plan (larger box / counter / second location) | Written | Pass | ☐ | ☐ |

## A.6 CAPCOM — Command Center orders, allocation, capacity

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| CC-01 | Admin login works; password not default; per-person logins or IAP | Login | Pass | ☐ | ☐ |
| CC-02 | Test order appears on Orders board < 1 min after payment | Test | Pass | ☐ | ☐ |
| CC-03 | Order detail shows all fields (items, wrap, design, message, giftee address, phone, retailer order #, dates) | Inspect | Complete | ☐ | ☐ |
| CC-04 | Allocation proposes Roger (WrapRider) for every Duval ZIP | Allocations board | Correct | ☐ | ☐ |
| CC-05 | Manual reassign works | Reassign + back | Pass | ☐ | ☐ |
| CC-06 | Pause switch works (no daily cap — decision Oct 3) | Turn on pause | New orders refused politely within 5 min; existing orders unaffected | ☐ | ☐ |
| CC-07 | Calendar view matches Wrrapd delivery dates | Compare | Pass | ☐ | ☐ |
| CC-08 | Cancel order flow sets status, notifies, flags refund | Test | Pass | ☐ | ☐ |
| CC-09 | Inventory forecast matches tomorrow's orders | Compare | Pass | ☐ | ☐ |
| CC-10 | Daily report CSV downloads and is correct | Download | Pass | ☐ | ☐ |
| CC-11 | Cron: 8 am morning sheet scheduled and received | Cloud Scheduler + inbox | Received at 8:00 ET | ☐ | ☐ |
| CC-12 | Cron: expire delivery preferences scheduled | Cloud Scheduler | Enabled | ☐ | ☐ |
| CC-13 | Cloud Run min instances ≥ 1 (no cold-start on shopper paths) | `gcloud run services describe` | Pass | ☐ | ☐ |

## A.7 WRAP — Wrap operations & video

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| WR-01 | WrapRider app login on Roger's phone (`wraprider.wrrapd.com`) | Login | Pass | ☐ | ☐ |
| WR-02 | Shift start → scan code → recording begins | Do it | Pass | ☐ | ☐ |
| WR-03 | Video uploads to the bucket and plays in Command Center | Order detail | Plays, correct order | ☐ | ☐ |
| WR-04 | Video bitrate capped (~1 Mbps) | File size per minute | ≤ ~8 MB/min | ☐ | ☐ |
| WR-05 | Upload survives Wi-Fi drop mid-wrap | Toggle Wi-Fi | Recovers, no lost segment | ☐ | ☐ |
| WR-06 | QR label generated and prints on the chosen printer | Print | Scannable from 30 cm | ☐ | ☐ |
| WR-07 | Wrap photo does **not** set order to delivered | Check status | Status = wrapped / ready | ☐ | ☐ |
| WR-08 | Correct gift ↔ correct label ↔ correct order (3 orders at once) | Blind check by second person | 3/3 correct | ☐ | ☐ |
| WR-09 | Quality standard photo board (what "good" looks like) | Printed at wrap table | Pass | ☐ | ☐ |
| WR-10 | Message card printed/handwritten exactly as ordered | Compare | Exact | ☐ | ☐ |
| WR-11 | Supplies on hand ≥ 3 days of forecast | Count | Pass | ☐ | ☐ |
| WR-12 | Shift hours appear correctly in weekly pay | Finance | Pass | ☐ | ☐ |

## A.8 RECOVERY — Delivery & proof of delivery

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| DEL-01 | Deliveries list shows today's stops with addresses | App | Pass | ☐ | ☐ |
| DEL-02 | QR scan on box opens correct delivery | Scan | Correct giftee | ☐ | ☐ |
| DEL-03 | Start delivery sends "on the way" to shopper | Phone | Received | ☐ | ☐ |
| DEL-04 | Door photo required to mark delivered | Try without photo | Blocked | ☐ | ☐ |
| DEL-05 | Door photo + GPS + time stored and visible on tracking page | Track page | Visible | ☐ | ☐ |
| DEL-06 | "Delivered" notification to shopper | Phone/email | Received with photo link | ☐ | ☐ |
| DEL-07 | Giftee-not-home flow (safe drop vs reattempt) rehearsed | Simulate | Per SOP-06 | ☐ | ☐ |
| DEL-08 | Wrong address / refused flow rehearsed | Simulate | Per SOP-06 | ☐ | ☐ |
| DEL-09 | High-value rule: gift value over **$100** | Test item above $100 | No safe drop; handed to an adult; photo of handoff | ☐ | ☐ |
| DEL-10 | Vehicle: registration, insurance card, business-use coverage | Documents in car | Pass | ☐ | ☐ |
| DEL-11 | Route plan for the day (Maps multi-stop) | Morning | Pass | ☐ | ☐ |
| DEL-12 | Delivery hours logged correctly for pay | Finance | Pass | ☐ | ☐ |

## A.9 COMMS — Customer notifications & service

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| CS-01 | Thank-you email + SMS arrive | Test order | < 2 min, not spam | ☐ | ☐ |
| CS-02 | Tracking link works on mobile, no login | Tap link | Pass | ☐ | ☐ |
| CS-03 | Delivery-choice email works (two Amazon dates) | Test | Choice saved | ☐ | ☐ |
| CS-04 | Shopper reply/text lands in Service desk | Reply to SMS | Appears in `/admin/service` | ☐ | ☐ |
| CS-05 | Inbound call routes to Roger | Call number | Rings / voicemail | ☐ | ☐ |
| CS-06 | 12 CS macros written and tested | SOP-10 | Pass | ☐ | ☐ |
| CS-07 | Giftee never receives a message that spoils the surprise | Review all templates | Pass | ☐ | ☐ |
| CS-08 | All shopper copy short, plain, no internal terms | Read all templates | Pass | ☐ | ☐ |
| CS-09 | Support response target set (e.g., same day) | Written | Pass | ☐ | ☐ |
| CS-10 | AI assistant (if on): never reveals gift contents to a giftee; hands off refunds/complaints to a person | 20 scripted test chats + texts | 20/20 correct | ☐ | ☐ |
## A.10 CREW — Contractor hiring, onboarding, pay

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| CR-01 | `pros.wrrapd.com` serves onboarding (not "Under construction") | Browser | Pass | ☐ | ☐ |
| CR-02 | Approval email links resolve for all 3 tracks | Click | No 404 | ☐ | ☐ |
| CR-03 | Apply → review → approve → onboarding → activate for a test WrapRider | End-to-end | Pass | ☐ | ☐ |
| CR-04 | Clickwrap agreements show correct entity name | Read | Matches Sunbiz | ☐ | ☐ |
| CR-05 | W-9 collection works (BoldSign keys/templates set) | Test | Signed W-9 stored | ☐ | ☐ |
| CR-06 | Background check + MVR process works (vendor or manual) | Test candidate | Result recorded | ☐ | ☐ |
| CR-07 | Insurance requirement consistent across agreement, onboarding, orientation | Read | No conflict | ☐ | ☐ |
| CR-08 | Sensitive uploads (ID, license, COI) not publicly accessible | Try direct URL logged out | Denied | ☐ | ☐ |
| CR-09 | Hourly rates set (not placeholders) for Duval ZIPs | Finance → Rates | Set | ☐ | ☐ |
| CR-10 | Stripe Connect onboarding for a test contractor | Do it | Bank verified | ☐ | ☐ |
| CR-11 | Platform Stripe balance funded for first payout | Stripe | Sufficient | ☐ | ☐ |
| CR-12 | Weekly payout (manual mode first) pays correct amount | Test week | Exact | ☐ | ☐ |
| CR-13 | 1099 filing method chosen | Written | Pass | ☐ | ☐ |
| CR-14 | Counsel review of IC structure completed before first non-founder shift | Memo | Done | ☐ | ☐ |

## A.11 SUPPLY — Hardware, kits, consumables

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| SUP-01 | Equipment policy decided (buy / sell-at-cost / lend) | Written | Pass | ☐ | ☐ |
| SUP-02 | Kit templates per role finalized (from §5.2) | List | Pass | ☐ | ☐ |
| SUP-03 | Mini label printer (asset #1) received, paired, prints a Wrrapd order number legibly; labels in stock | Print 10 test labels; leave one in a hot car for a day | Readable; 2 spare rolls minimum | ☐ | ☐ |
| SUP-04 | Equipment & Kits module live (assets, shipments, acknowledgments) | Command Center | Pass | ☐ | ☐ |
| SUP-05 | Roger's own kit registered as asset set #1 | Module | Pass | ☐ | ☐ |
| SUP-06 | First kit shipment rehearsed end-to-end (ship → track → receive → acknowledge) | Ship to self | Pass | ☐ | ☐ |
| SUP-07 | Consumables reorder points set (paper, tissue, boxes, tape, labels) | Module | Pass | ☐ | ☐ |
| SUP-08 | Supplier accounts set up with 2-day delivery | Accounts | Pass | ☐ | ☐ |
| SUP-09 | Return-on-deactivation checklist written | SOP-15 | Pass | ☐ | ☐ |

## A.12 DATA — Data, media, backups, restore

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| DATA-01 | Firestore PITR enabled | `gcloud firestore databases describe` | Enabled | ☐ | ☐ |
| DATA-02 | Firestore delete protection enabled | Same | Enabled | ☐ | ☐ |
| DATA-03 | Firestore daily backup schedule (≥ 14 days) | `gcloud firestore backups schedules list --database=wrrapd-firebase-db01` | Present | ☐ | ☐ |
| DATA-04 | VM `orders/` + `customers/` synced to versioned GCS hourly | Bucket listing | Latest < 1 h old | ☐ | ☐ |
| DATA-05 | Media bucket configured on Cloud Run (`FIREBASE_STORAGE_BUCKET`) | Env + upload test | Pass | ☐ | ☐ |
| DATA-06 | Lifecycle on `proof/` and `shift-video/` | Bucket config | Present | ☐ | ☐ |
| DATA-07 | Bucket not publicly listable; objects only via token/signed URL | Try logged out | Denied | ☐ | ☐ |
| DATA-08 | Restore drill: Firestore backup → test DB | Do it | Order readable | ☐ | ☐ |
| DATA-09 | Restore drill: VM orders from GCS | Do it | Files identical | ☐ | ☐ |
| DATA-10 | Data retention policy written (addresses, messages, videos, IDs) | Doc | Pass | ☐ | ☐ |
| DATA-11 | Firestore indexes exported to repo | `firestore.indexes.json` | Present | ☐ | ☐ |

## A.13 SECURITY

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| SEC-01 | SSH only via IAP; `default-allow-ssh` 0.0.0.0/0 removed | Firewall list | Pass | ☐ | ☐ |
| SEC-02 | RDP 3389 rule deleted | Firewall list | Pass | ☐ | ☐ |
| SEC-03 | Admin MFA or IAP on `/admin` | Login | Pass | ☐ | ☐ |
| SEC-04 | Google Maps browser key restricted by referrer + API | Cloud console | Pass | ☐ | ☐ |
| SEC-05 | No secrets in git history | Secret scan (e.g., gitleaks) | Zero | ☐ | ☐ |
| SEC-06 | `CRON_SECRET`, `INGEST_API_KEY`, internal keys rotated if ever shared in chat/docs | Rotate | Pass | ☐ | ☐ |
| SEC-07 | Ops API keys between WordPress and Command Center rotated and stored only server-side | Inspect | Pass | ☐ | ☐ |
| SEC-08 | WordPress admin accounts reviewed; 2FA on admin users | WP admin | Pass | ☐ | ☐ |
| SEC-09 | WordPress plugins updated; unused deactivated (incl. temporary AI Engine plugin) | WP admin | Pass | ☐ | ☐ |
| SEC-10 | Billing alerts + budget caps on GCP and AI APIs (Grok, Stability) | Console | Pass | ☐ | ☐ |

## A.14 SURGEON — Monitoring & incident response

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| MON-01 | Uptime checks: api, pay, Cloud Run, wrrapd.com, apply, wraprider | Cloud Monitoring | All configured | ☐ | ☐ |
| MON-02 | Alerts go to Roger by SMS + email | Trigger a test | Received < 5 min | ☐ | ☐ |
| MON-03 | Error tracking (Sentry) on pay server + Command Center | Throw test error | Appears | ☐ | ☐ |
| MON-04 | Alert on: ingest failure, payment-without-order, payout failure, cron failure | Simulate each | Alert received | ☐ | ☐ |
| MON-05 | Incident contact sheet (Helcim, Stripe, SiteGround, Google Cloud, Twilio, insurer, tow/road) | SOP-12 | Printed + phone | ☐ | ☐ |
| MON-06 | Rollback rehearsed (golden tags; previous Cloud Run revision) | Do it | < 10 min | ☐ | ☐ |

## A.15 LEGAL — Legal, insurance, tax, licensing

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| LEG-01 | Entity active on Sunbiz (Wrrapd Inc., C corporation); "Wrrapd, Inc." everywhere — fix any "LLC" | Sunbiz + agreements | Pass | ☐ | ☐ |
| LEG-02 | City of Jacksonville / Duval local business tax receipt | Certificate | Pass | ☐ | ☐ |
| LEG-03 | Florida sales tax: registered or not required (CPA letter/email) | Document | Pass | ☐ | ☐ |
| LEG-04 | General liability policy bound | Certificate | Pass | ☐ | ☐ |
| LEG-05 | Bailee / inland marine (customer goods in our care, incl. in vehicles) | Certificate | Pass; limit ≥ highest expected gift value × max held | ☐ | ☐ |
| LEG-06 | Hired & non-owned auto (and Roger's personal auto business-use endorsement) | Certificate | Pass | ☐ | ☐ |
| LEG-07 | Cyber liability (customer PII, payments) | Quote/bound | Decision made | ☐ | ☐ |
| LEG-08 | Shopper Terms reflect refund practice, service area, timing | Read | Pass | ☐ | ☐ |
| LEG-09 | Privacy page = CWS privacy disclosures | Compare | Pass | ☐ | ☐ |
| LEG-10 | Patent provisional filed before public launch announcement | USPTO receipt 64/159,570, Sep 22, 2026 | Pass — calendar the Sep 22, 2027 non-provisional/PCT deadline | ☑ | ☐ |
| LEG-11 | Trademarks considered/filed | Decision | Pass | ☐ | ☐ |
| LEG-12 | Contractor agreements reviewed by Florida counsel (before first hire) | Memo | Pass | ☐ | ☐ |

---

## A.16 Launch countdown

| T-minus | Date (for Nov 2 launch) | Actions |
|---|---|---|
| T-30 d | Sat Oct 3 | This review; decisions in Exhibit B |
| T-21 d | Mon Oct 12 | All RED items closed or waived; dress rehearsals begin |
| T-14 d | Mon Oct 19 | Friends & family beta opens; all stations run 1st checks |
| T-7 d | Mon Oct 26 | All 2nd checks done; open items list ≤ 5 YELLOW |
| T-72 h | Fri Oct 30 | **Go/No-Go poll** (below); freeze code (golden tag `golden-beta-2026-10-30`) |
| T-24 h | Sun Nov 1 | Supplies counted; hub run done; backups verified; alerts tested |
| T-2 h | Mon Nov 2, 7:00 ET | Daily open checklist; Amazon smoke test; uptime green |
| T-0 | Mon Nov 2, 9:00 ET | Announce |
| T+1 h | 10:00 ET | First real orders inspected end-to-end in Command Center |
| T+24 h | Tue Nov 3 | First-day review; raise or hold the daily cap |
| T+7 d | Mon Nov 9 | Week review; pricing/delivery-fee data check |

## A.17 The Go/No-Go poll (read aloud, Fri Oct 30)

FLIGHT calls each station; each answers **"GO"** or **"NO-GO + reason"**.

> FLIGHT: "BOOSTER?" — "GO." · "GUIDANCE?" — "GO." · "FIDO?" — "GO." · "INCO?" — "GO." · "GROUND?" — "GO." · "CAPCOM?" — "GO." · "WRAP?" — "GO." · "RECOVERY?" — "GO." · "COMMS?" — "GO." · "CREW?" — "GO." · "SUPPLY?" — "GO." · "DATA?" — "GO." · "SECURITY?" — "GO." · "SURGEON?" — "GO." · "LEGAL?" — "GO."
> FLIGHT: "All stations GO. We are GO for Duval beta launch."

**Launch commit criteria (any one = NO-GO):**
1. Any RED item open without a written waiver.
2. Fewer than 10 clean end-to-end rehearsal orders.
3. Any rehearsal where a gift went to the wrong giftee, or a package could not be matched.
4. Insurance not bound, or sales-tax status unresolved.
5. Backups or restore drill not proven.
6. No working alert to Roger's phone.
7. Hub address fails any major carrier.

**Abort / scrub rules after launch (pause new orders via kill switch):**
- Amazon checkout flow broken (EXT smoke test fails).
- Payments failing or charging wrong amounts.
- Two delivery mix-ups in a week.
- Unmatched packages > 1 for more than 24 hours.
- Roger unavailable with no trained backup for the next day's deliveries (assumed true until the first hire — pause new orders and message affected shoppers the same day).

## A.18 Daily flight checklist (every operating day, 10 minutes)

**Morning (before 8:00 ET)**
1. Uptime dashboard all green; no overnight alerts unresolved.
2. Amazon smoke test: cart opt-in appears, ZIP gate works (don't pay).
3. Command Center: today's deliveries, tomorrow's expected arrivals, unmatched packages = 0.
4. Morning sheet received; supplies ≥ 3 days.
5. Capacity cap set for today.

**Midday**
6. Hub/PO Box run → intake photos → all matched or quarantined.
7. "Expected but not arrived" list → contact shoppers as needed.

**Evening**
8. All delivered orders have photo + GPS + time; no order stuck in "out for delivery".
9. Service desk inbox zero (or replied with a time).
10. Refunds/cancellations logged; backups ran (DATA-04 timestamp < 1 h).

---

# Exhibit B — Questions for Roger

**Answered Oct 3, 2026:**
- Q1 Hub: PO Box with **USPS Street Addressing** — 150 Busch Dr #26067, Jacksonville FL 32218 (in extension 3.0.12).
- Q2 Label code: **No** — match by packing slip (retailer order number capture becomes mandatory).
- Q3 Sales tax: **Registered** with Florida DOR.
- Q4 Insurance: **none bound yet**.
- Q5 Beta retailers: **all 10**.

**Answered Oct 3, 2026 (second round)** — see the Decisions log in §1.2a for Q6–Q18. Q1 address: **150 BUSCH DR #26067, JACKSONVILLE FL 32218**.

Still open:
- Support hours you can commit to (Q13).
- Order-number format for the dummy-order cleanup.

Original question list, for reference:

1. **Hub receiving address:** Does the micro-hub have a **street address** that accepts UPS, FedEx, and Amazon deliveries? Or is it USPS PO Box only? Does that post office offer USPS "Street Addressing" for your box? (Determines R1.)
2. **Matching packages:** Are you OK adding the Wrrapd order code to the ship-to (for example, name line "WRRAPD INC W-1234" or address line 2)? Retailers allow line 2 freely.
3. **Sales tax:** Has a CPA confirmed whether Wrrapd's wrap service fee is taxable in Florida, and is Wrrapd registered with the Florida Department of Revenue?
4. **Insurance:** What policies are bound today (general liability, bailee/inland marine, auto business use, cyber)?
5. **Beta retailers:** Amazon only, or Amazon + Target + LEGO, or all 10?
6. **Entity:** Wrrapd, Inc. or LLC on Sunbiz? Is there a Jacksonville local business tax receipt?
7. **Delivery pricing:** Stay "free final delivery" for beta and decide with data in mid-November, or add a delivery fee now?
8. **Daily capacity:** Your realistic stops per day and wraps per day (to set the cap).
9. **Flowers:** OK to turn flowers off for the public beta?
10. **Label printer:** Which printer/labels do you use today?
11. **Equipment policy:** Contractors buy their own tools, buy a kit at cost, or borrow a Wrrapd kit?
12. **The 209 orders on the VM** (Dec 2025 – Sep 2026): are any of these real customers, or all test? (Affects cleanup and backfill to Firestore.)
13. **Customer support hours** you can commit to during beta.
14. **High-value threshold** for no-safe-drop / hand-to-person (e.g., anything over a set amount).
15. **Patent:** Has the provisional been filed? (Public launch starts disclosure timing.)
16. **Backup person:** Who covers deliveries if you're sick on a delivery day before your first hire?
17. **Micro-hub:** Is it locked, insured, camera-covered, and who else has access?
18. **Helcim:** Is the account fully approved for live settlement with funds reaching the bank?

---

# Exhibit C — Evidence captured on Oct 3, 2026

| Check | Result |
|---|---|
| `git log` head | `2e0ac4c` — extension 3.0.11 shipped (loose-item box charge) |
| `https://wrrapd.com/` | 200; MU build `2026-09-22-hire-chrome-gate`, `2026-10-01-amazon-contrast` |
| `https://wrrapd.com/privacy/` | "Last updated April 23, 2026" |
| `https://apply.wrrapd.com/wraprider/` | 200; `2026-09-23-onboarding-step-pager` |
| `https://pros.wrrapd.com/` | 200 but **"Under construction"** |
| `https://pros.wrrapd.com/wraprider-onboarding/` | **404** |
| `https://api.wrrapd.com/health` | 200 |
| `https://wraprider.wrrapd.com/wraprider` | 200 |
| PM2 | `wrrapd-server` online, **153 restarts**; `wrrapd-api` (Python) online, 11 restarts |
| Pay server Stripe key | `sk_test_…` (test); Helcim tokens present |
| Cloud Run Stripe key | `sk_live_…` (contractor payouts); admin password not the default |
| Cloud Run resources | 1 vCPU, 512 MiB, concurrency 80, max 20 instances, no min instances set |
| Cloud Run storage env | **No `FIREBASE_STORAGE_BUCKET` / `GCS_BACKUP_BUCKET`** |
| Firestore `wrrapd-firebase-db01` | **PITR disabled, delete protection disabled, no backup schedule** |
| Buckets | `wrrapd-media` (~573 MB, soft delete 7 d, no lifecycle), `wrrapd-media-backup-april-2026`, Cloud Build |
| Cloud Scheduler | Only `wrrapd-weekly-payouts` (Thu 18:00 UTC) |
| Uptime checks | None |
| VM crontab | None |
| VM orders | 209 `order_*.json` (Oct 2025 → Sep 2026; only 1 in Sep), 932 KB; one backup tarball (Jun 19) |
| VM disk | 49 GB, 44% used |
| VM firewall | SSH and RDP open to 0.0.0.0/0; port 5000 (Flask debug) not publicly reachable |
| Hub address in extension | `WRRAPD INC / PO BOX 26067 / JACKSONVILLE FL 32226-6067` |
| Retailer order # capture in extension | Not found |
| Box charge server-side | `sanitizePricingCartFromRequest` drops title/category/`needs_gift_box` |
| MediaRecorder bitrate | Not set (browser default) |
