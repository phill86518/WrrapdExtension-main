# Wrrapd — Jacksonville / Duval Beta Launch: Master Readiness Review

**Prepared:** Monday, October 19, 2026 (full refresh of the Oct 3–5 review; covers everything built Oct 5–19, including the new copy-paste "Buy through us" flow on wrrapd.com)
**For:** Roger (founder, first WrapRider, Flight Director)
**Scope:** Whole business and whole application — shopper site (now with two ways to order), Chrome extension 3.0.14, "Buy through us" (`wrrapd.com/buy`), pay server, Command Center, delivery hubs, contractor apps, hire funnel, logistics, hardware, data/media architecture, legal, insurance, tax.
**Status:** INTERNAL. Never publish any part of this document. It contains pay mechanics, routing, and security findings.

How this was built: a read-only review of the full monorepo (`extension/`, `backend/wrrapd-api-repo/WrrapdServer/`, `tracking-platform/`, `wordpress/`, `docs/`), all 152 commits since the Oct 5 version, the Oct 5–19 working chats with Roger, and live checks on Oct 19, 2026 against `wrrapd.com`, `wrrapd.com/buy`, `apply.wrrapd.com`, `pros.wrrapd.com`, `api.wrrapd.com`, `pay.wrrapd.com`, the Cloud Run service, Firestore, Cloud Storage, Cloud Scheduler, Cloud Monitoring, PM2, and the VM firewall. Evidence is in Exhibit C. Anything Roger did outside the code and chats (insurance calls, test shipments, rehearsal orders) is shown as **not confirmed** — tell us and it moves to done.

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
3. System-by-system readiness review (19 systems, including new System 18 "Buy through us" and System 19 Delivery hubs)
4. The architecture question — "Will we hit an Uber-style wall?"
5. Hardware & kit program + Command Center Equipment module spec
6. SOPs — what exists, what must be written before launch
7. Timeline — phases and dates to public beta and through the holidays
8. **Exhibit A — Master Pre-Launch Checklist ("All Systems — Go/No-Go")**
9. Exhibit B — Questions for Roger
10. Exhibit C — Evidence captured on Oct 19, 2026 (with Oct 3 for comparison)

---

# 1. Executive assessment

## 1.1 Bottom line

**Software is close to ready; operations have not been tested yet; and a second business line went live on the homepage this week.**

- **Shopper software: about 90% ready** (was 85% on Oct 5). Extension **3.0.14** is live on the Chrome Web Store (approved Oct 8). Delivery hubs and the service area are now run from Command Center. The multi-item wrap discount is live. The homepage was rebuilt on Oct 19 with **two ways to order**: install the extension, or paste product links.
- **"Buy through us" (copy-paste, `wrrapd.com/buy`): about 60% ready, and it is open to the public now.** The shopper pastes up to 5 product links, Wrrapd reads the pages, the shopper adds gift-wrap and flowers, and pays Wrrapd once for the items and the wrap. Then a person at Wrrapd buys the items from the store and ships them to the hub. The software is built and tested in code. It has **not** completed a real order end to end. Its shopper terms are still marked **draft for counsel**, and Wrrapd is the **buyer of record** for those items. The page mode in Command Center is set to **live** (see R11).
- **Operations: still about 55% ready** — no change since Oct 5 that we can confirm. The Oct 12–18 dress-rehearsal week has passed with no rehearsal orders recorded. Insurance (R9), carrier test shipments to the hub (R1), the live $1 Helcim test (PAY-01), and kits are not confirmed done.

**What this means for Nov 2.** The Nov 2 public beta is still reachable, but only if rehearsals start this week. Two clean rehearsal weeks are needed before the Go/No-Go poll. We recommend a firm rule: **if there are not 10 clean extension rehearsals plus 5 clean "Buy through us" rehearsals by Fri Oct 30, launch moves to Mon Nov 9** (Go/No-Go on Fri Nov 6). See §7.

| Milestone | Target date | Condition |
|---|---|---|
| Roger's open blockers closed (insurance bound, PAY-01, pros link, admin login) | **Sat Oct 24** | R7, R9, PAY-01 done |
| "Buy through us" terms reviewed by counsel | **Sat Oct 24** | R11 |
| Dress rehearsals (extension + Buy through us) | **Tue Oct 20 – Thu Oct 29** | 10 extension + 5 Buy-through-us orders, zero unexplained failures |
| Friends-and-family closed beta | **Mon Oct 26 – Sun Nov 1** (overlaps rehearsals) | Invite-only, Roger watches every order |
| Go/No-Go poll | **Fri Oct 30** | Exhibit A §A.18 passes |
| **Public Duval beta launch** | **Mon Nov 2** (fallback **Mon Nov 9**) | Poll passes |
| Holiday peak | Fri Nov 27 – Thu Dec 24 | At least 1 trained backup WrapRider/JoyRider by Nov 20 |

## 1.2 What is genuinely strong

- **Two ways to order, one back end.** Extension orders and "Buy through us" orders land in the same Command Center Orders board, use the same wrap pricing, the same flowers, the same hubs, and the same Helcim checkout.
- **The service area is now data, not code.** Hubs live in Command Center (`/admin/zip-codes` → Delivery hubs). Each order is assigned to the closest hub from the giftee's ZIP, and only ZIPs within **50 miles** of an active hub are offered. A second hub can be added without a Chrome Web Store release.
- **Every order is caught.** Hourly reconcile (`wrrapd-order-reconcile`) compares paid orders with Command Center and emails ops if any are missing; the pay server resends failed hand-offs every 5 minutes.
- **Backups and monitoring are real.** Hourly VM backups (last one 19:07 ET on Oct 19), Firestore point-in-time recovery and delete protection ON with 14-day daily backups, 6 uptime checks emailing admin@wrrapd.com, 5 Cloud Scheduler jobs running.
- **Pricing integrity.** The server decides every charge on both paths. Volume discount, $0.99 box, flowers, retailer shipping and retailer tax are all computed server-side.
- **Retailer order numbers are captured** on all 10 retailers' confirmation pages (since 3.0.13), and Hub intake searches by packing-slip number.
- **Media design is right**: photos and videos go to object storage with only a pointer in the database (see §4).

## 1.2a Decisions log

| Date | Decision | Effect on this plan |
|---|---|---|
| Oct 3 | Hub = USPS Premium PO Box with Street Addressing: **WRRAPD INC, 150 BUSCH DR #26067, JACKSONVILLE FL 32218** | In extension since 3.0.12; carrier tests (HUB-01/02) still open |
| Oct 3 | No Wrrapd code on the shipping label — match by packing slip | Retailer order # capture shipped in 3.0.13 |
| Oct 3 | All 10 retailers live for beta | EXT-19 per retailer; per-retailer off switch (EXT-20) still not built |
| Oct 3 | Wrrapd Inc. is a **C corporation**; registered with Florida DOR; 2026 resale certificate on file; annual filer | R8 closed |
| Oct 3 | **Free final delivery** stays for now | R10 watch item |
| Oct 3 | **No daily order cap**; pause switch instead | Kill switch today = empty ZIP list. "Buy through us" has its own off/test/live switch |
| Oct 3 | **Flowers stay ON** | Live Publix prices since Oct 4 |
| Oct 3 | Contractors **borrow a Wrrapd kit and return it** | Equipment agreement + return flow before first hire |
| Oct 3 | High-value threshold **$100** | No safe-drop above $100 |
| Oct 3 | Provisional patent **64/159,570** filed Sep 22, 2026 | Non-provisional / PCT deadline **Sep 22, 2027** |
| Oct 4 | **Never miss an order** — every order shows under Orders | Reconcile + retry live |
| Oct 4 | Extra items not for wrapping: shopper calls within 48 hours | Hub intake "Hold for pickup" |
| Oct 5 | **Wrapping pay $30.00 per dozen** (prorated) + **$15.00 every 100 wrapped boxes**; delivery is Amazon Flex-style planned route | Agreements + Finance updated |
| Oct 5 | **JoyRiders and WrapRiders keep 100% of tips** | Not in weekly-pay math |
| Oct 6 | Extension **3.0.13** published on the Chrome Web Store (retailer order # capture) | R2 code side done |
| Oct 7 | **Multi-item wrap volume discount** configurable in Command Center → Pricing | Live tiers: **2–4 wraps 10% off, 5+ wraps 15% off** the wrap base |
| Oct 7 | Later items in a cart are **locked to the first item's giftee ZIP** | One hub, one tax rate, one flower area per order |
| Oct 7 | **Closest hub from giftee ZIP**; hubs managed in Command Center | No store release needed to add a hub |
| Oct 8 | Extension **3.0.14** approved by Google (new listing `lobngnjcjeimefihnobdmocicopikoip`); all site install links point to it | EXT-01 |
| Oct 9 | Only giftee ZIPs **within 50 miles of an active hub** are offered | Stored list is still the 34 Duval ZIPs |
| Oct 12–13 | Launch a second way to order: **"Buy through us"** — paste links, Wrrapd buys the items | New System 18; new R11–R14 |
| Oct 13 | Buy-through-us limits: **$100 per item**, **$300 per order**, up to **5 links**, quantity up to 10; cheapest standard shipping only (no Prime / club) | In `buy-for-you-config.json` |
| Oct 15–16 | One standard shipping fee per store, dropped at that store's free-shipping minimum. **Amazon under $35 → $3.99** | `standard-shipping.js` |
| Oct 14–18 | Product pages that block plain reads go through **ZenRows** (Oct 14), **Bright Data** (Oct 17–18) and **Gemini** | Per-read cost; budget caps needed (SEC-10) |
| Oct 18 | **Clothing and shoes paused** on Buy through us; shopper is pointed to the extension | Soft-launch limit |
| Oct 18 | Electronics allowed, but the shopper must accept a separate warranty sentence | Terms §Electronics |
| Oct 19 | **New homepage** (two ways: ① install extension, ② copy-paste), new demo video, multi-item discount pop on How-it-works Step 2 | Live build `2026-10-19-header-cta-2s` |
| Oct 19 | Public copy must not shout specific discount percentages ("looks cheap"); use soft wording | Customer-facing copy rule |

## 1.3 Launch blockers

**Closed since Oct 3:** R2 (order # capture — code; confirm on real orders), R3 (proof storage), R4 (hub intake), R5 (door photo + GPS), R6 (backups + Firestore recovery), R8 (sales tax registration).

**Still open, in priority order:**

| # | Blocker | Why it matters | Status / next step |
|---|---|---|---|
| R9 | **Insurance — none confirmed bound.** General liability, bailee / inland marine (customer goods in our care), hired & non-owned auto, cyber. | One crash or one stolen box without coverage could end the company. **Bigger now:** with Buy through us, Wrrapd *owns* the merchandise (buyer of record) — up to $300 per order — from the store purchase until the giftee has it. | **RED.** Broker call this week; tell the broker about both order types and the highest expected value held at once |
| R11 (new) | **"Buy through us" is live to the public before its terms are reviewed.** The page mode is `live`. Terms version `buy-terms-2026-10-18-draft` says Wrrapd may be the buyer of record and limits warranty and return rights. | A shopper can pay today. If the terms or the buyer-of-record setup are wrong, that is a legal and refund exposure on every order. | **RED for Buy through us.** Roger's choice: (a) switch mode to **test** (preview code only) until counsel signs off and 5 rehearsals pass — recommended; or (b) keep live as a quiet soft launch and accept the risk in writing. Extension path is not affected |
| R12 (new) | **Buy-through-us purchasing operations not rehearsed.** After the shopper pays, a person must buy the items on the store site (cart → checkout → Wrrapd account/card → ship to hub) and record the store order number in Command Center. The software never pays a store by itself. | Price or stock can change between the shopper's payment and our purchase; a missed purchase means a gift never ships. | **RED for Buy through us.** Write SOP-16 (which card, which store accounts, how fast, what to do on price change / out of stock), then 5 rehearsals (BUY-01 to BUY-15) |
| R1 | **Hub address carrier tests.** 150 BUSCH DR #26067 is in the extension, but no test shipment from UPS, FedEx, Amazon Logistics or OnTrac is confirmed. Buy-through-us orders ship to the same address. | If a carrier refuses the post office address, orders bounce on day one. | **RED** until HUB-01/02 pass. Fastest proof: place the first rehearsal orders at Amazon, Best Buy, Walmart and Target |
| R7 → YELLOW | **Contractor onboarding links.** `pros.wrrapd.com` now redirects to the **apply.wrrapd.com homepage** — not to the onboarding page. An approval email link like `pros.wrrapd.com/wraprider-onboarding/` lands on the apply homepage. | New hires get lost at the first step. | **YELLOW.** Either make the redirect keep the path, or add `define( 'WRRAPD_WRAPSTARS_PROS_HOST', 'apply.wrrapd.com' );` to the apply site's `wp-config.php` |
| R10 → YELLOW | **Free final delivery** (launch / CAC choice). | See §2.3 — Buy through us adds card fees on merchandise with no margin on it. | Business decision with beta data |
| R13 (new) | **Card fees on Buy-through-us merchandise.** Items are passed through at the store price, but Helcim charges about 3% on the whole charge, including the merchandise. On a $100 item that is about $3 of the $6.99 wrap fee. | Margin leak that grows with basket size. | **YELLOW.** Decide before public beta: absorb it as CAC, or add a small "purchasing" line. See §2.3 |
| R14 (new) | **Server does not check the giftee ZIP at charge time on the extension path.** `/buy` checks the ZIP on the server; the extension's `helcim-purchase` / `process-payment` do not. | A tampered request could pay for an out-of-area delivery. | **YELLOW.** Small code fix (PAY-05) |

## 1.4 Important but not blocking (YELLOW, fix during beta)

- **Stripe customer routes still callable** (`/create-payment-intent`, `/create-checkout-session`, `/api/checkout-session-complete`) with the test-mode key. Helcim is the live processor. Disable them (PAY-10).
- **No per-retailer off switch** (EXT-20). Today the only switch for the extension is emptying the ZIP list (stops everything). Buy through us has its own retailer list and an off/test/live mode in Command Center → Website orders → Settings.
- **Extension bundles changed on Oct 19** (Jacksonville ZIP label + multi-item discount toast) but the version is still 3.0.14. To reach shoppers it needs a bump to **3.0.15**, Roger's Windows build, and a Chrome Web Store upload. Not urgent.
- **Product-page reading cost.** ZenRows, Bright Data and Gemini are paid per read; Kohl's can fan out to several services and take ~100 seconds. Set monthly budget caps and alerts on each account (SEC-10).
- **Privacy policy** says Oct 3, 2026 in the body, but the page's search description still says "April 23, 2026," and the policy does not yet describe Buy through us (Wrrapd buying on the shopper's behalf, store receipts in Wrrapd's name). Update before public beta (WEB-09).
- **SSH** is key-only but still open to the internet (`default-allow-ssh` 0.0.0.0/0 next to the IAP rule). RDP is closed. Roger to choose "home IP + IAP only" or leave key-only (SEC-01).
- **Admin logins with authenticator codes** are built; Roger's own setup is not confirmed (CC-01).
- **SMS alerts:** monitoring emails admin@wrrapd.com; a mobile number for text alerts is not confirmed (MON-02).
- **Cloud Run minimum instances** still not set (cold start on the first Command Center or tracking request) (CC-13).
- **PM2:** `wrrapd-server` shows 302 lifetime restarts (153 on Oct 3) with **0 unstable restarts** — these are deploy restarts, not crashes. Keep watching.
- Hire funnel: background check (Checkr) and identity (Persona) still need vendor keys. Electronic W-9 is live.

## 1.5 Overall readiness scorecard

| # | System | Oct 5 | Oct 19 | Status |
|---|---|---|---|---|
| 1 | Shopper website (wrrapd.com) — new homepage | 85% | 90% | GREEN/YELLOW |
| 2 | Chrome extension — Amazon | 80% | 85% | YELLOW (needs rehearsal orders) |
| 3 | Chrome extension — 9 other retailers | 55% | 60% | YELLOW (EXT-19 per retailer) |
| 4 | Payments & pricing integrity | 85% | 88% | GREEN/YELLOW (PAY-01, PAY-05, PAY-10) |
| 5 | Pay/API server (VM) | 85% | 88% | GREEN/YELLOW |
| 6 | Hub & PO Box inbound logistics | 55% | 55% | YELLOW (R1 carrier tests) |
| 7 | Command Center — orders & allocation | 85% | 90% | GREEN |
| 8 | Wrap operations & video proof | 80% | 80% | GREEN/YELLOW (prove one upload) |
| 9 | Delivery & proof of delivery | 80% | 80% | GREEN/YELLOW (prove on a rehearsal) |
| 10 | Customer communications & service | 75% | 80% | GREEN/YELLOW |
| 11 | Contractor hiring & onboarding | 65% | 65% | YELLOW (R7 link) |
| 12 | Contractor pay, payouts, 1099 | 75% | 75% | YELLOW |
| 13 | Hardware, kits & supplies | 10% | 10% | GREY → must exist before first hire |
| 14 | Data, media & architecture | 80% | 85% | GREEN |
| 15 | Security & privacy | 75% | 75% | YELLOW (SSH, MFA, privacy update) |
| 16 | Monitoring, backup & disaster recovery | 70% | 80% | GREEN/YELLOW (SMS alerts, restore drill) |
| 17 | Legal, insurance, tax, licensing | 45% | 40% | **RED** (R9 insurance; R11 Buy-through-us terms) |
| 18 | Flowers add-on | 75% | 80% | GREEN/YELLOW |
| 19 | **Buy through us (copy-paste)** — new | — | 60% | **RED** for public use until R11 + R12 close |
| 20 | **Delivery hubs & service area** — new | — | 85% | GREEN |

---

## 1.6 Order flow and role workflows

<div class="diagram"><img src="docs/diagrams/order-flow.svg" alt="Wrrapd order flow"></div>

<div class="diagram"><img src="docs/diagrams/role-workflows.svg" alt="Wrrapd workflows by role"></div>

# 2. Business model review

## 2.1 The model as built

Since Oct 19 the homepage offers **two ways to order**. Both end in the same wrap → deliver operation.

**Way ① — Chrome extension (shopper buys from the store):**

1. Shopper installs the Chrome extension, shops normally at Amazon (or 9 other retailers), and opts in to Wrrapd at the cart.
2. Shopper enters the **giftee's ZIP**; only ZIPs within 50 miles of an active hub proceed (today: the 34 Duval ZIPs). Later items are locked to the same ZIP.
3. Shopper chooses wrap (standard $6.99, AI design +$2.99, upload design +$1.99), message, optional flowers (~$17.99), and gets the $0.99 box charge for loose items. **2–4 wrapped items: 10% off the wrap; 5 or more: 15% off.**
4. Shopper pays **Wrrapd** on `pay.wrrapd.com` (Helcim) and then pays the **retailer** separately, with the ship-to locked to the Wrrapd hub.
5. Retailer ships to the hub. A JoyRider (or WrapRider) collects from the PO Box/hub.
6. A WrapStar wraps on video (or the WrapRider does), prints/attaches a signed QR label.
7. JoyRider/WrapRider delivers to the giftee on the retailer date + 1 day, with a door photo.
**Way ② — "Buy through us" (Wrrapd buys from the store):**

1. Shopper enters the giftee's ZIP and pastes up to 5 product links on wrrapd.com (no extension, works on a phone).
2. Wrrapd reads each page and builds a cart (limits: $100 per item, $300 per order; clothing and shoes paused).
3. Shopper gift-wraps every item in the same modal (same prices, same discount, same flowers).
4. Shopper pays Wrrapd **once** on `pay.wrrapd.com` (Helcim): items + store shipping + store tax, plus wrap + flowers + service tax.
5. A person at Wrrapd buys the items on the store site (pooled by store and hub, hourly windows or at the free-shipping minimum), shipping to the hub, and records the store order number.
6. From the hub on, the flow is the same as Way ①.

**Both ways:**

- Contractors: WrapStars and WrapRiders are paid **$30.00 per dozen** finished wraps (prorated for fewer or more than a dozen; **$15.00 bonus every 100 wrapped boxes**). No hourly wrapping rate, no pace deduction. JoyRiders and WrapRider delivery use an Amazon Flex-style planned route. Weekly Stripe Connect payouts Thursday 6 PM ET; 1099s annually. Electronic Form W-9 (IRS Rev. March 2024) is filled and signed during onboarding.

## 2.2 What is smart about it

- **No inventory risk.** The retailer carries the product; Wrrapd only touches it for a day.
- **Asset-light local footprint.** One PO Box/micro-hub plus home-based wrappers can cover a metro.
- **Gift-presentation premium.** Retailer gift wrap (where it exists) is poor; Wrrapd's video-documented, hand-delivered wrap is a real step up.
- **Duval-only beta** keeps the delivery radius drivable by one person.

## 2.3 Unit economics (rewritten Oct 5)

The Oct 3 draft treated every order as a **solo delivery** and counted wrapping labor plus a whole florist bill against a $6.99 wrap fee. That is the wrong unit. Five facts change the picture:

1. **Wrapping pay is $30.00 per dozen** finished wraps ($2.50 each), **prorated** when the count is under or over a dozen. A **$15.00 bonus** is paid each time a WrapStar or WrapRider crosses another **100** finished wraps. Clock time does not change wrapping pay.
2. **Delivery is Amazon Flex-style.** Command Center builds a **smart route** of typically **10–12 stops**. That route is one block of about **2 hours**, often less. The driver is paid for that planned block (about 5 minutes at each door, plus the drive at 25 mph), not for a separate trip per gift.
3. **JoyRiders and WrapRiders keep 100% of tips** given at delivery (cash, card, or in the app). Tips sit on top of route pay. They are not Wrrapd revenue and they are not a Wrrapd cost.
4. **The wrap fee is a customer-acquisition price.** Marketing and CAC are why $6.99 can sit near wrapping labor. Contribution is judged on the **route**.
5. **Flowers are one bouquet price.** That price is the store price plus **$2.00**. The shopper is not told there is an upcharge. Wrrapd keeps the $2.00. The rest of the bouquet price pays the store. It is not a $15–$22 loss against the wrap fee.

### What the shopper pays Wrrapd (not the retailer)

| Line | Amount | Role |
|---|---|---|
| Standard wrap | $6.99 | Acquisition / conversion price |
| AI wrap design (optional) | +$2.99 | Margin |
| Upload wrap design (optional) | +$1.99 | Margin |
| Gift box (loose items) | $0.99 | Covers the box |
| Flowers (optional) | One bouquet price | Store price plus $2.00, shown as the bouquet price. The $2.00 is Wrrapd's. |

Retailer merchandise is paid to Amazon (or the other store) separately.

### Wrapping labor (contractor)

$30.00 / 12 wraps = **$2.50 per finished wrap**. Six wraps pay $15.00. Twenty-four pay $60.00. The $15.00 bonus is separate and lands when lifetime finished wraps cross 100, 200, and so on. Clock time does not change these amounts.

### Delivery labor (Amazon Flex model)

A Jacksonville smart route of **12 stops** and about **25 miles** is one block:

| Piece | How it is counted | Time |
|---|---|---|
| At the door | 12 stops × about 5 minutes | 1.0 h |
| Driving | 25 miles ÷ 25 mph | 1.0 h |
| **Planned route** | door + drive, same trip | **about 2.0 h, often less** |
| **Delivery pay at $30/hr** | 2.0 × $30 | **about $60** |
| **Per stop** | $60 ÷ 12 | **about $5** |

The earlier **$120** figure was wrong. It paid **15 minutes at every stop** (12 × 15 min = 3 hours = $90) and then **added the drive again** (1 hour = $30), as if the driver stood at each door for a quarter hour and the miles were a second job. On a smart route the doors and the miles are the same two hours.

A tip at the door is the driver's. It is not part of the $60.

### Worked example: one 12-stop route

Assumptions, all stated:

- 12 gifts, each with standard wrap at **$6.99**.
- 6 of those gifts include flowers. Example store price **$15.00**. The shopper is charged **$17.00** (the extra $2.00 is Wrrapd's). The screen shows $17.00, not a separate fee.
- 4 gifts are loose and get the **$0.99** box charge.
- Delivery is the 2-hour route above, **$60**.
- This contractor has not reached 100 finished wraps, so the **$15** bonus is **$0**. The bonus pays at wrap 100, 200, and so on, not on every route.
- Wrapping paper, ribbon, and tape are the contractor's. They are not a Wrrapd cost in this table.
- Card fees below are an estimate of **3% + $0.30 per shopper charge**, on 12 separate checkouts. Helcim's live rate can differ.

**What shoppers pay Wrrapd**

| Line | Math | Amount |
|---|---|---|
| Gift wrap | 12 × $6.99 | $83.88 |
| Flowers, full price | 6 × $17.00 | $102.00 |
| Gift box | 4 × $0.99 | $3.96 |
| **Charged to shoppers** | | **$189.84** |

**Where that money goes**

| Line | Math | Amount |
|---|---|---|
| Florist (the store price inside the bouquet) | 6 × $15.00 | −$90.00 |
| Wrapping pay | 12 × $2.50, which is one dozen at $30.00 | −$30.00 |
| 100-wrap bonus | not reached (12 wraps, bonus starts at 100) | $0.00 |
| Delivery pay | about 2 hours × $30/hr | −$60.00 |
| Card processing (estimate) | 3% × $189.84 = $5.70, plus 12 × $0.30 = $3.60 | −$9.30 |
| **Left on this route, before ads** | $189.84 − $90 − $30 − $60 − $9.30 | **about $0.50** |

The old “Wrrapd's own lines ~$100” label was the wrap fees ($83.88), the flower $2 only ($12.00), and the boxes ($3.96) added together, with the florist's $90 and the shoppers' $102 flower payments left out. That is why the row was hard to read. The table above shows every dollar the shopper paid and every dollar it pays for.

Read the result this way:

- Wrapping labor on these 12 gifts is **$30**, not $22–$30 of mystery cost. The wrap fees are **$83.88**.
- The florist's **$90** is paid out of the **$102** the shoppers already paid for the bouquets. Wrrapd keeps **$12** (6 × $2).
- Delivery on this route is **about $60** (about **$5 a stop**), not $120.
- Before advertising, this example route is roughly a wash. The **$6.99** wrap price is still the acquisition price: ads and the cost of getting the customer are not in the table. Free delivery stays a launch choice while Duval density is being proven. Contractor dollar amounts stay off wrrapd.com and the apply landings.

### Worked example: one "Buy through us" order (new Oct 19)

Assumptions, all stated: one shopper pastes 2 Target items, $40.00 and $25.00, for one giftee. Target shipping is free at $35+. Store tax 7.5% at the hub ZIP. Standard wrap on both, 10% volume discount. No flowers. Card fees estimated at 3% + $0.30. This order is one stop on a 12-stop route (about $5).

**What the shopper pays Wrrapd**

| Line | Math | Amount |
|---|---|---|
| Items (passed through at the store price) | $40.00 + $25.00 | $65.00 |
| Store shipping | Free at $35+ | $0.00 |
| Store tax | 7.5% × $65.00 | $4.88 |
| Gift wrap | 2 × $6.99 = $13.98, less 10% | $12.58 |
| Service tax | 7.5% × $12.58 | $0.94 |
| **Charged to the shopper** | | **$83.40** |

**Where that money goes**

| Line | Math | Amount |
|---|---|---|
| Paid to Target | $65.00 + $4.88 | −$69.88 |
| Service tax remitted | | −$0.94 |
| Card processing (estimate) | 3% × $83.40 + $0.30 | −$2.80 |
| Wrapping pay | 2 × $2.50 | −$5.00 |
| Delivery (one stop of a 12-stop route) | ~$60 ÷ 12 | −$5.00 |
| **Left, before ads** | | **about −$0.22** |

Read it this way: the order is roughly a wash, like the extension route example. The difference is that **about $2.10 of the $2.80 card fee is on merchandise Wrrapd earns nothing on.** The fee grows with the basket: a $300 order pays about $9 in card fees on merchandise alone. That is R13: absorb it as acquisition cost during the beta, or add a small purchasing line before the holidays. Price changes between the shopper's payment and our purchase are a second, smaller leak; Command Center highlights overages so they can be caught.

**B. Independent-contractor classification.** Piece-rate wrapping ($30/dozen, prorated, plus a milestone bonus) is a cleaner IC factor than hourly wrapping. Delivery remains planned-hours (Flex-style). Tips are the contractor's. Video proof, availability windows, and borrowed kits still need Florida employment counsel **before the first non-founder hire**.

**C. Retailer dependency.** The extension automates checkout pages and rewrites ship-to addresses. Amazon can change its pages any day (fragility) or object to the practice (policy risk). The Terms already shift account risk to shoppers. **Update Oct 19: Plan B now exists** — "Buy through us" lets a shopper order without the extension. It carries its own retailer risk: Wrrapd buys as the store's customer and reads product pages through paid services, which some store terms may not allow (counsel, System 16).

**D. Capacity of one WrapRider.** Roger alone can realistically handle about **10–15 delivery stops/day** plus one PO Box run, and roughly 30–40 wraps on a wrap-heavy day. That is one Flex-sized route, not 10–15 dedicated drives. Roger chose a **pause switch, not a cap** (Oct 3). Today that means emptying the ZIP list for the extension and setting Buy through us to **off** or **test** — both should be tested (EXT-21, BUY-01). Buy through us also adds Roger's time at the store checkout for each place pool.

**E. The pay-then-abandon case.** A shopper can pay Wrrapd and then not finish (or cancel) the retailer order. Hub intake now flags paid orders with no retailer order number by end of day; refund SOP is live (same-day reverse). Remaining: inbound package tracking. (Buy through us does not have this problem — Wrrapd places the store order itself — but has the reverse one: Wrrapd must place it on time.)

**F. Gift privacy.** Amazon gift orders hide prices, but packing slips may still contain shopper names and messages. Wrrapd staff see everything. The Code of Conduct should cover confidentiality; giftee address data must be protected.

---

# 3. System-by-system readiness review

Each system lists subsystems, current state, risks, and what must happen before launch. Item IDs (e.g., `EXT-07`) match the checks in Exhibit A.

## System 1 — Shopper website (`wrrapd.com`, WordPress on SiteGround)

| Subsystem | State | Notes |
|---|---|---|
| New homepage (promoted Oct 19 from `/landing6/`) | GREEN | Occasion strip, animated How it works, gift ideas, "For the people you miss". Old home kept at `/landing-retired-20261019/` for rollback. Live MU build `2026-10-19-header-cta-2s`, landings `v30` |
| Header "two ways" | GREEN | ① orange **Add your FREE Chrome extension** button (2-second pulse); **OR** ② copy-paste → jumps to the paste form. Desktop only; hidden on phones |
| Paste form → `/buy/` | YELLOW | Giftee ZIP first, then product link; opens `/buy/` with both filled in. Depends on System 18 |
| Homepage demo popup | GREEN | Plays the extension-flow demo (Demo-3, ~28 s) with sound, then cycles retailer names. Old "Popup Brand" plugin overrides were updated Oct 19 so the new clip loads |
| Multi-item discount pop | GREEN | Coral-to-magenta flash on How-it-works Step 2 and on hover of the paste label. Soft wording, no percentages |
| `/landing1`–`/landing5` + waitlist | GREEN | Private test pages (holiday rescue, checkout demo, Jacksonville, from anywhere, gift combo); waitlist posts to `/api/landing/waitlist` |
| `/gift-ideas/` page | GREEN | New |
| Extension install links | GREEN | All point to 3.0.14 listing; older listings rewritten in the browser |
| Login / register / Google / Amazon login | YELLOW | Historical fragility; test on mobile + desktop (WEB-05/06) |
| My Orders | YELLOW | Now also shows paid Buy-through-us orders (matched by email). Test with a real claimed order of each type (WEB-07) |
| Terms | YELLOW | Website Terms + separate Buy-through-us terms (draft) |
| Privacy | YELLOW | Body "Last updated: October 3, 2026"; search description still says April 23; add Buy-through-us wording (WEB-09) |
| Service area + timing copy | GREEN | "Delivering in Jacksonville, FL (new areas added soon)"; giftee delivery = day after the store delivers to the hub |
| SEO / sitemap | GREEN | |

## System 2 — Chrome extension (3.0.14 live on the Chrome Web Store since Oct 8)

| Subsystem | State | Notes |
|---|---|---|
| Version on store = repo | GREEN | `manifest.json` 3.0.14; listing `lobngnjcjeimefihnobdmocicopikoip`. Oct 19 bundle changes need 3.0.15 to ship |
| 3.0.14 changes | GREEN | Waits for server config and prices before showing labels; null-safe pricing; hub guard on Pay Wrrapd; 4-second box-quote timeout |
| Closest hub from giftee ZIP | GREEN | `GET /api/delivery-hub?postalCode=` — new hubs need no store release |
| ZIP lock after first item | GREEN | Every retailer; one hub / tax rate / flower area per order |
| Multi-item volume discount | GREEN | Same server tiers as Buy through us |
| Amazon cart opt-in, gift options, hub address swap, Pay Wrrapd, Place Order hook | YELLOW | Most mature; large page-automation surface; daily smoke test from launch (EXT-23) |
| Multi-address / mixed carts on Amazon | YELLOW | Tell beta shoppers "one giftee per order" |
| Other 9 retailers | YELLOW | All live; each needs one passing rehearsal order (EXT-19). LEGO checkout fixes shipped Oct 7 |
| Retailer order # capture | GREEN/YELLOW | Since 3.0.13 on all 10 confirmation pages; CI check `check:order-capture`. Confirm on real orders (EXT-14) |
| Per-retailer off switch | GREY | Not built (EXT-20). Kill switch = empty ZIP list |
| Install heartbeat | GREEN | Daily, install ID only |
| Automated tests | YELLOW | Build + Best Buy / Kohl's / order-capture fixture checks on every push |

## System 3 — Payments & pricing integrity

| Subsystem | State | Notes |
|---|---|---|
| Helcim customer checkout (extension) | YELLOW | Live tokens; **PAY-01 live $1 charge + refund not confirmed** |
| Helcim checkout for Buy through us | YELLOW | `pay.wrrapd.com/checkout/buy`; one charge for items + store shipping + store tax + wrap + flowers + service tax; returns shopper to wrrapd.com. Not yet run with a real card |
| Server-side pricing | GREEN | Both paths priced on the server; $0.99 box fixed Oct 3; volume discount server-side |
| Volume discount | GREEN | 2–4 wraps 10%, 5+ wraps 15%, on the wrap base before tax; edited in Command Center → Pricing; 9 tests |
| Giftee ZIP checked at charge time | YELLOW | Yes on `/buy`; **no** on extension charge routes (R14 / PAY-05) |
| Stripe customer routes | YELLOW | Still callable with the test key — disable (PAY-10) |
| Idempotency / double charge | GREEN | Helcim idempotency key + "already processed" scan |
| Charged but order not in Command Center | GREEN | Reconcile panel on Orders + hourly check + 5-minute resend |
| Refunds | GREEN/YELLOW | Command Center refund (Helcim / Stripe), shopper email, signed webhook. Buy through us: merchandise refunds limited to what the store returns, 15-day window; wrap/flowers mostly non-refundable |
| Chargebacks / disputes | GREY | Evidence packet SOP-09 (wrap video, door photo, timestamps; for Buy through us also the store receipt) |
| Sales tax | GREEN/YELLOW | 7.5% on Wrrapd lines at the giftee ZIP. Buy through us also collects the **store's** tax at the hub ZIP on merchandise + shipping and pays it to the store. Ask the CPA whether the resale certificate should be used instead (Exhibit B) |
| PCI scope | GREEN | Helcim hosted fields |

## System 4 — Pay/API server (`wrrapd-server`, PM2 on the GCP VM)

| Subsystem | State | Notes |
|---|---|---|
| Process health | GREEN/YELLOW | Online; 302 lifetime restarts, **0 unstable** (deploy restarts) |
| Orders persistence | GREEN | `orders/order_*.json` (214 files) + hourly/nightly GCS backup; `/health/backup` OK |
| Hand-off to Command Center | GREEN | Retry every 5 minutes + hourly reconcile |
| Lockdown | GREEN | Server-only pricing, ingest accepts paid orders only, CORS allowlist, per-IP rate limits |
| Buy-through-us engine | YELLOW | `lib/buy/*`: page reader (own fetch → ZenRows → Bright Data → Gemini → Grok), quotes, billing, place pools, retailer-order registry, manual additions, terms. 11 test files |
| Third-party keys | YELLOW | `ZENROWS_API_KEY`, `BRIGHTDATA_*`, `GEMINI_API_KEY`, `XAI_API_KEY` on the VM `.env`; no spend caps confirmed |
| Emails | YELLOW | SMTP via `mail.wrrapd.com`; check deliverability (API-12) |
| Logs | YELLOW | Trim PII (API-08) |
| Python AI helper (`wrrapd-api` :5000) | GREEN-ish | Not public; turn off debug |

## System 5 — Hub & PO Box inbound logistics

| Subsystem | State | Notes |
|---|---|---|
| Receiving address accepting all carriers | **RED (R1)** | Street Addressing in place; no carrier test confirmed |
| Daily pickup routine | GREY | SOP-01 not written |
| Package → order matching | GREEN/YELLOW | Hub intake searches packing-slip #, Wrrapd #, names, item. Buy-through-us packages match by the **RO-** store order number recorded at purchase |
| Intake check-in | GREEN | Received / partly / damaged / missing + note |
| Damage / wrong / missing | GREY | SOP-03 |
| "Expected but not arrived" | YELLOW | 11:30 PM `wrrapd-hub-exceptions` email lists held items and paid orders with no retailer #; full late-arrival report still manual |
| Returns to retailer | GREY | SOP-14. More important now: for Buy through us, Wrrapd is the store's customer and must start any return |

## System 6 — Command Center: orders & allocation

| Subsystem | State | Notes |
|---|---|---|
| Ingest → Firestore `orders`, Orders board, calendar, detail | GREEN | Both order types |
| Auto-allocation (15 mi) + approval board | GREEN | |
| Delivery hubs (`/admin/zip-codes`) | GREEN | New Oct 7 |
| Pricing incl. volume discount (`/admin/pricing`) | GREEN | |
| Website orders (`/admin/buy-for-you`) | YELLOW | New — see System 18 |
| Retailer orders in Today nav | GREEN | New Oct 16 |
| Service desk labels | GREEN | Texts, calls and voicemails labeled separately (Oct 17) |
| Reconcile panel | GREEN | |
| Pause switch | YELLOW | Extension: empty ZIP list. Buy through us: mode off/test/live |
| Admin auth | GREEN/YELLOW | Personal login + authenticator built; Roger's setup not confirmed |
| Firestore indexes in repo | YELLOW | DATA-11 |

## System 7 — Wrap operations & video proof

| Subsystem | State | Notes |
|---|---|---|
| Morning sheet email (7:45 am ET) | GREEN | `wrrapd-wrapstar-morning` scheduled |
| Shift start/end, scan-to-open | GREEN | |
| Wrap video | GREEN/YELLOW | Bucket `wrrapd-proofs`; 720p ~0.9 Mbps; prove one upload in a rehearsal |
| QR label | GREEN/YELLOW | Prove one label on the mini printer |
| Label printer | ? | Asset #1 (ordered Oct 3, due Oct 9–15) — arrival not confirmed |
| Wrap photo does not mark delivered | GREEN | |
| Per-item barcodes | GREY | Later |

## System 8 — Delivery & proof of delivery

| Subsystem | State | Notes |
|---|---|---|
| Deliveries list, Start / Mark delivered | GREEN | |
| Door photo + GPS + "handed to" (required over $100) | GREEN | Delivered cannot be set without the photo |
| QR scan opens delivery | GREEN | Signed |
| Out-for-delivery + delivered messages | GREEN | Text + email, once each |
| Route planning | GREY | Google Maps multi-stop for beta |
| Not home / safe drop / refused | GREY | SOP-06 |

## System 9 — Customer communications & service

| Subsystem | State | Notes |
|---|---|---|
| Thank-you email + SMS | GREEN | |
| Public tracking page | GREEN | |
| Out-for-delivery / delivered | GREEN | |
| Service desk (Twilio SMS / voice / voicemail) | GREEN | A2P 10DLC approved; labels split Oct 17; Meta link set up Oct 17 |
| AI text assistant | YELLOW | Live; set `SUPPORT_ALERT_SMS_TO` so handoffs text Roger |
| Buy-through-us emails | YELLOW | Team alert to admin@wrrapd.com on new batches; manual-addition approve-and-pay email; check wording on a rehearsal |
| CS playbook / macros | GREY | SOP-10 — add Buy-through-us replies (price changed, out of stock, return) |
| Website chat (Tidio) | YELLOW | Human-answered |

## System 10 — Contractor hiring & onboarding

| Subsystem | State | Notes |
|---|---|---|
| Apply forms (3 tracks) + fit score | GREEN | |
| Command Center review → activate | GREEN | |
| Onboarding host | YELLOW (R7) | `pros.wrrapd.com` redirects to apply homepage without the path |
| Clickwrap agreements | GREEN | Compensation schedules updated Oct 5 ($30/dozen, milestone bonus, tips 100% to driver, Finance → Pay rates) |
| Electronic Form W-9 | GREEN | |
| Background check / identity | YELLOW | No vendor keys |
| Insurance certificate requirement | YELLOW | Agreement vs onboarding conflict still open |
| Hiring ads (Facebook) | YELLOW | Creatives prepared; posting cadence not confirmed |

## System 11 — Contractor pay, payouts, 1099

| Subsystem | State | Notes |
|---|---|---|
| Wrapping pay $30.00 / dozen + $15.00 per 100 | GREEN | |
| Delivery tips 100% to driver | GREEN | |
| Delivery rates by ZIP | YELLOW | Set real rates before first hire |
| Weekly payouts (Thu 6 PM ET) | GREEN | Fund the Stripe platform balance first |
| 1099-NEC filing method | YELLOW | Choose a filing service |

## System 12 — Hardware, kits & supplies

**State: GREY.** Full program and module spec in §5. Must exist before the first non-founder contractor starts.

## System 13 — Data, media & architecture

See §4. Summary today: VM JSON + Firestore with hourly backups and reconcile; Firestore recovery ON; proofs bucket with lifecycle; video capped near 1 Mbps. Buy-through-us batches (`WB-`), store orders (`RO-`) and the purchases ledger live on the pay server and show in Command Center — include them in the restore drill (DATA-09).

## System 14 — Security & privacy

| Subsystem | State | Notes |
|---|---|---|
| Secrets | YELLOW | `.env` + Cloud Run env; more third-party keys since Oct 13. Secret Manager in Stage 2 |
| Google Maps browser key | YELLOW | Restrict by referrer + API |
| CORS, rate limits | GREEN | Since Oct 3 |
| Ingest proxy | GREEN | Paid orders or internal key only |
| Admin auth | GREEN/YELLOW | Built; Roger to set up |
| VM firewall | YELLOW | RDP closed; SSH open to 0.0.0.0/0 (key-only) |
| Buy-through-us preview code | YELLOW | Stored in config; rotate if mode goes back to test |
| PII in logs / retention | YELLOW / GREY | Trim; write retention policy |

## System 15 — Monitoring, backup & disaster recovery

| Subsystem | State | Notes |
|---|---|---|
| Uptime checks | GREEN | `wrrapd-home`, `wrrapd-api-health`, `wrrapd-pay-checkout`, `wrrapd-apply`, `wrrapd-command-center`, `wrrapd-order-backups`. Add `wrrapd.com/buy` |
| Alerting | YELLOW | Email to admin@wrrapd.com; add SMS |
| Error tracking | GREY | Sentry optional |
| VM orders backup | GREEN | Hourly to `gs://wrrapd-ops-backups` |
| Firestore | GREEN | PITR + delete protection ON; daily backups kept 14 days |
| Restore drill | GREY | Not done (DATA-08/09) |
| Golden rollback | GREEN | Tags exist; old homepage kept |

## System 16 — Legal, insurance, tax, licensing

| Subsystem | State | Notes |
|---|---|---|
| Entity (Wrrapd, Inc., C corp), EIN, bank | GREEN | |
| Local business tax receipt (Jacksonville / Duval) | ? | LEG-02 |
| Florida sales tax | GREEN | Ask CPA about store tax vs resale certificate on Buy-through-us purchases |
| Insurance | **RED (R9)** | Now includes merchandise Wrrapd owns |
| Buy-through-us terms | **RED (R11)** | Draft for counsel; buyer of record; electronics warranty sentence |
| Retailer terms of use | YELLOW | Buying for others and reading product pages through paid services may conflict with some store terms; counsel to note per retailer |
| Contractor classification review | YELLOW | Before first hire |
| Patent | GREEN | Provisional filed Sep 22, 2026. Note: the copy-paste flow is new subject matter — ask the patent attorney whether to add it before the Sep 22, 2027 non-provisional |
| Trademarks | ? | LEG-11 |

## System 17 — Flowers add-on (ON for beta)

Unchanged in design since Oct 5: giftee ZIP → nearest Publix (live store prices and photos via the store locator, cached 6 h) + Sam's Club (stored list) → 4–8 bouquets at one price (store price + $2.00, no upcharge shown). Since Oct 5: duplicate bouquet photos removed (Oct 17); bouquets show inside the Buy-through-us wrap modal; flowers can be picked on their own; the giftee ZIP is shown in the modal. Ops risks unchanged: buy same day, substitution rule, receipt photo.

## System 18 — "Buy through us" (copy-paste, `wrrapd.com/buy`) — NEW

**What it is.** A second way to order for shoppers who will not install a Chrome extension, or who shop on a phone. Wrrapd buys the items and ships them to the hub. Then the normal wrap → deliver flow takes over.

**Shopper flow as built**

1. Enter the **giftee's ZIP** (homepage paste form or `/buy/`). Only allowed ZIPs proceed, with the same polite out-of-area message as the extension. Links cannot be pasted until the ZIP is accepted.
2. Paste up to **5 product links** from the 10 supported stores (Amazon, Target, Walmart, LEGO, Ulta, Nordstrom, Kohl's, Sephora, Best Buy, Etsy). Pages are read in parallel; the screen says items can take up to 90 seconds.
3. Wrrapd builds a cart grouped by store: title, photo, size/color, quantity (1–10; repeated links merge), price (sale price, not crossed-out), arrival date at the hub, one standard shipping fee per store, store tax.
4. Items Wrrapd cannot read go to an **Excluded** list with a reason; the shopper can press **Add it manually** and the team adds it by hand.
5. Limits: **$100 per item**, **$300 per order** (merchandise). **Clothing and shoes are paused** (shopper is pointed to the extension). Electronics need a separate warranty acknowledgment.
6. Accept the Buy-through-us terms, then gift-wrap every item in the same modal as the extension (wrap, design, message, flowers, box). Volume discount applies.
7. **Review and pay** on `pay.wrrapd.com` (Helcim): items + store shipping + store tax, and gift-wrap + flowers + service tax, shown side by side. After payment the shopper returns to wrrapd.com; the order shows in My orders.
8. Giftee delivery date = **latest hub arrival date + 1 day**.

**Store shipping rules (charged to the shopper, paid to the store):** Amazon $3.99 under $35; Target $5.99 under $35; Walmart $6.99 under $35; Kohl's $8.95 under $49; Ulta $6.95 under $35; Sephora $6.95 under $50; Nordstrom free; LEGO tiers; Etsy per seller. Cheapest standard option only — no Prime or club shipping.

**How pages are read**

| Store | Path | Fragility |
|---|---|---|
| Amazon, Walmart, LEGO, Sephora, Etsy | Own fetch, then ZenRows | Walmart ZIP/shipping block needs care |
| Target | Target's product API + ZIP-specific delivery date | May ask to re-paste with the store ZIP set |
| Ulta | ZenRows (keeps shade links as one item) | Medium |
| Nordstrom, Best Buy | ZenRows first; Bright Data / Gemini fallback | High (bot pages) |
| Kohl's | Fan-out: Bright Data browser + dataset, Gemini, unlocker, direct; skips ZenRows; up to ~100 s | **Highest** (Akamai) |
| All | Grok turns page text into product facts and categories | — |

**Command Center — Website orders (`/admin/buy-for-you`)**

| Route | What it does |
|---|---|
| `/admin/buy-for-you` | Queue: quote desk, place pools, paid-to-place, in progress |
| `/admin/buy-for-you/[id]` | One shopper batch (`WB-…`): desk quote, record placement |
| `/admin/buy-for-you/retailer-orders` | Registry of store checkouts (`RO-…`) |
| `/admin/buy-for-you/retailer-orders/[id]` | One store order and the `WB-` batches inside it |
| `/admin/buy-for-you/manual` | Manual additions (open cart → add line; already paid → approve-and-pay email) |
| `/admin/buy-for-you/purchases` | Items-we-purchased ledger |
| `/admin/buy-for-you/settings` | Mode (off / test / live), limits, retailers, preview code |

**Placing store orders.** Paid batches are pooled by **store + exact hub**. A pool is ready when it meets that store's free-shipping minimum or at the next hourly (or 2-hour) Eastern window. A **person** checks out on the store site with Wrrapd's account and card, then records the store order number, total and hub arrival date; the software maps it to each `WB-` batch and sends the order to Orders. The quote helper may open a store cart to read costs but always empties it and never presses Place Order. Overages versus what the shopper paid are highlighted.

| Subsystem | State | Notes |
|---|---|---|
| Shopper flow `/buy/` | GREEN/YELLOW | Built; many fixes Oct 13–19; no real paid order yet |
| Page reading | YELLOW | Works on tested links; Kohl's/Nordstrom slow and costly |
| Billing & tax | GREEN | Server-computed; tests for shipping, line facts |
| Terms gate | **RED (R11)** | Draft for counsel |
| Mode | **RED (R11)** | `live` today |
| Placing store orders | **RED (R12)** | Manual; SOP-16 + rehearsals needed |
| Store accounts & card | ? | Which card, which accounts, who has access (Exhibit B) |
| Returns / refunds | YELLOW | Wrrapd must start store returns; 15-day window; SOP-14 |
| Tests | GREEN | `standard-shipping`, `place-pools`, `place-pools-hub-isolation`, `retailer-orders`, `manual-add`, `ulta-zenrows`, `brightdata`, `nordstrom-page`, `walmart-ship`, `line-facts`, `supplied-product` |

## System 19 — Delivery hubs & service area — NEW

| Subsystem | State | Notes |
|---|---|---|
| Hub list | GREEN | `data/delivery-hubs.json`, edited in `/admin/zip-codes`. One active hub: `jax-1`, 150 BUSCH DR #26067, Jacksonville FL 32218 |
| Closest-hub assignment | GREEN | Straight-line distance between ZIP centers; unknown ZIP → default hub |
| 50-mile service radius | GREEN | Public ZIP list = stored list ∩ within 50 miles of an active hub |
| Stored ZIP list | GREEN | Still the 34 Duval ZIPs (Oct 2) |
| Second hub | GREY | Possible without a store release; no decision yet. Each new hub needs its own carrier tests, pickup SOP, contractors and insurance |

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

**Stage 1 — before public beta.** *Status Oct 19:* items 2, 3, 4, 5 and most of 6–7 are **done** (hourly backups, Firestore recovery, proofs bucket + lifecycle, video cap, lockdown, uptime checks). Item 1 is covered by reconcile + retry rather than a rewrite. Still open: server ZIP check on extension charges, Sentry (optional).
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
| SOP-16 (new) | Buy through us — placing store orders | Which card and store accounts, who may place, how soon after payment, use the place pool, record RO number + total + hub date, price went up / out of stock / store cancelled, never use Prime or club shipping |
| SOP-17 (new) | Buy through us — manual additions and read failures | When to add by hand, approve-and-pay email, what to tell the shopper, when to remove a store from the allowed list |

---

# 7. Timeline

All dates 2026 unless noted. Owners: **R** = Roger, **Eng** = engineering (agent/developer), **CPA**, **Broker**, **Counsel**.

### Done since the Oct 5 plan
- Phase 1 "Stabilize" software items: storage bucket, video cap, backups, Firestore recovery, door photo + GPS, order # capture (3.0.13), schedulers, uptime checks, lockdown, refunds — all shipped Oct 3–5.
- Extension 3.0.13 (Oct 6) and 3.0.14 (Oct 8) published.
- Delivery hubs + 50-mile service area (Oct 7–9). Volume discount (Oct 7).
- "Buy through us" built and opened (Oct 13–19). New homepage (Oct 19).

### Slipped
- **Dress rehearsals (planned Oct 12–18):** none recorded.
- **Insurance, PAY-01, carrier tests, pros link, admin login:** not confirmed.

### Phase A — Close Roger's blockers (Tue Oct 20 – Sat Oct 24)
- R/Broker: insurance quote and bind (R9) — mention both order types.
- R/Counsel: review Buy-through-us terms and the buyer-of-record setup (R11). Until then, decide mode **test** vs **live**.
- R: PAY-01 — one real $1 charge and refund with your own card.
- R: set up your admin login with an authenticator app (CC-01); send a mobile number for SMS alerts (MON-02).
- R or Eng: fix the `pros.wrrapd.com` link (R7).
- R: decide store accounts and card for Buy-through-us purchases; Eng writes SOP-16.
- Eng: server ZIP check on extension charge routes (PAY-05); disable Stripe customer routes (PAY-10); add `wrrapd.com/buy` uptime check; budget alerts on ZenRows / Bright Data / Gemini / Grok (SEC-10); privacy policy update (WEB-09).

### Phase B — Dress rehearsals (Tue Oct 20 – Thu Oct 29)
- **10 extension orders** to friends at 10 Duval ZIPs: Amazon (×3), Target, Walmart, Best Buy, LEGO, Ulta, Kohl's, one more. Mix single item, 2+ items (discount), loose item (box), AI design, upload design, flowers.
- **5 Buy-through-us orders**: one Amazon under $35 ($3.99 ship), one Target over $35, one Walmart, one Kohl's or Nordstrom (hard read), one with "Add it manually". Each one: Roger places the store order from the place pool, records the RO number, receives at the hub, wraps, delivers.
- These orders double as **carrier tests** (R1): note which carrier delivered each package to 150 Busch Dr.
- Deliberate failure tests: card decline, out-of-area ZIP, extension shopper pays then abandons the store checkout, Buy-through-us item out of stock at purchase time, damaged package, giftee not home, refund.
- Restore drill: Firestore backup → test database; VM orders (incl. `WB-`/`RO-` data) from GCS.

### Phase C — Friends & family (Mon Oct 26 – Sun Nov 1)
- 15–30 invited shoppers, starting only after the first 5 rehearsals pass. Roger reviews every order the same day.
- Daily 15-minute review: orders, failures, time per wrap, time per stop, read failures on Buy through us, cost per order.

### Phase D — Go/No-Go (Fri Oct 30) → Public Duval beta (Mon Nov 2, fallback Mon Nov 9)
- If 10 + 5 clean rehearsals, insurance bound, and R11 resolved: GO for Nov 2.
- If not: Go/No-Go moves to Fri Nov 6, launch Mon Nov 9. Buy through us can stay in **test** mode at launch while the extension goes live, if only R11/R12 are open.
- Announce locally; watch daily; raise volume in steps once two clean days in a row.

### Phase E — Holiday peak (Fri Nov 27 – Thu Dec 24)
- Black Friday Nov 27, Cyber Monday Nov 30.
- Holiday cutoff (shopper-friendly wording): suggest **order by Sat Dec 19** for Christmas Eve delivery when the store promises hub arrival by Tue Dec 22. Buy-through-us orders need one more half-day for our purchase window — suggest **Fri Dec 18**.
- Extra hub runs daily; overflow storage; first backup contractor trained by Nov 20.

### Phase F — Review & scale (Jan 4 – Mar 2027)
- Post-mortem; unit economics for both order types; Stage 2 architecture (§4.4); decide second hub.

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
| PROCURE | "Buy through us" — reading, billing, placing store orders | Roger |

---

## A.1 BOOSTER — Shopper website

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| WEB-01 | Homepage loads, desktop Chrome | Incognito, cold cache | < 3 s, no console errors, correct build string in view-source | ☐ | ☐ |
| WEB-02 | Homepage loads, iPhone Safari + Android Chrome | Real devices | Header, logo left, hamburger works, no overlap | ☐ | ☐ |
| WEB-03 | Install CTA opens current CWS listing | Click | Listing shows 3.0.14+ | ☐ | ☐ |
| WEB-04 | CTA hidden after install | Install extension, reload | Install buttons hidden | ☐ | ☐ |
| WEB-05 | Register / login / password reset | New email, end-to-end | Email arrives < 2 min, login works | ☐ | ☐ |
| WEB-06 | Google + Amazon login | Real accounts | Lands logged-in, gold buttons, no plugin blue | ☐ | ☐ |
| WEB-07 | My Orders shows a claimed order (extension and Buy through us) | Place one test order of each type with the same email, log in | Both listed with correct status | ☐ | ☐ |
| WEB-08 | Terms page current, refund section readable | Read | Matches actual refund practice | ☐ | ☐ |
| WEB-09 | Privacy page updated (10 retailers, Helcim, heartbeat, Buy through us / buyer of record); search description date fixed | Read + view-source | Body and description dates match; matches CWS privacy form | ☐ | ☐ |
| WEB-10 | Service-area + timing statement visible | Read how-it-works/FAQ | Says Jacksonville/Duval only; delivered after the retailer delivers | ☐ | ☐ |
| WEB-11 | Contact page works | Submit form + email + phone | Reaches support within 5 min | ☐ | ☐ |
| WEB-12 | No dollar amounts for contractor pay on any public page | Search site | Zero hits | ☐ | ☐ |
| WEB-13 | Colors: gold `#f6b933`, navy `#0c0638`, no neon/blue buttons | Visual pass | Pass | ☐ | ☐ |
| WEB-14 | W3 cache purged after last MU deploy | View-source build marker | Matches repo `WRRAPD_MU_BUILD` | ☐ | ☐ |
| WEB-15 | SSL valid on all hosts | `curl -vI` | Valid ≥ 30 days | ☐ | ☐ |

## A.2 GUIDANCE — Chrome extension

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| EXT-01 | CWS published version = repo `manifest.json` | CWS dashboard | Same version | ☑ | ☐ |
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
| PAY-01 | Helcim live end-to-end (not confirmed as of Oct 19) | Roger buys one real order with his own card, then refunds it | Charge appears, refund lands, deposit reaches the bank | ☐ | ☐ |
| PAY-01b | Flower price shown = price charged = store price + $2.00 | Order with flowers; compare to the store shelf | Exact | ☐ | ☐ |
| PAY-01c | Flower order still pays after a server restart mid-checkout | Pick bouquet → `pm2 restart` → pay | Payment succeeds | ☐ | ☐ |
| PAY-02 | Statement descriptor reads "WRRAPD" | Real card statement | Recognizable name (reduces chargebacks) | ☐ | ☐ |
| PAY-03 | Server total = shopper-displayed total (all wrap types + box + tax) | 6 test carts | Exact to the cent | ☐ | ☐ |
| PAY-04 | Tampered client total is ignored | Edit total in devtools | Server charges correct price | ☐ | ☐ |
| PAY-05 | Out-of-area ZIP refused **by the server** on extension charge routes (`/buy` already checks) | Direct API call to `helcim-purchase` / `process-payment` | 400, no charge | ☐ | ☐ |
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
| CC-06 | Pause switch works (no daily cap — decision Oct 3): empty ZIP list for the extension; Buy-through-us mode off | Turn on pause | New orders refused politely within 5 min; existing orders unaffected | ☐ | ☐ |
| CC-07 | Calendar view matches Wrrapd delivery dates | Compare | Pass | ☐ | ☐ |
| CC-08 | Cancel order flow sets status, notifies, flags refund | Test | Pass | ☐ | ☐ |
| CC-09 | Inventory forecast matches tomorrow's orders | Compare | Pass | ☐ | ☐ |
| CC-10 | Daily report CSV downloads and is correct | Download | Pass | ☐ | ☐ |
| CC-11 | Cron: 8 am morning sheet scheduled and received | Cloud Scheduler + inbox | Received at 8:00 ET | ☑ | ☐ |
| CC-12 | Cron: expire delivery preferences scheduled | Cloud Scheduler | Enabled | ☑ | ☐ |
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
| CR-01 | `pros.wrrapd.com/<page>` lands on the same onboarding page at apply.wrrapd.com (Oct 19: redirects to the apply homepage, path lost) | Browser | Pass | ☐ | ☐ |
| CR-02 | Approval email links resolve for all 3 tracks | Click | No 404 | ☐ | ☐ |
| CR-03 | Apply → review → approve → onboarding → activate for a test WrapRider | End-to-end | Pass | ☐ | ☐ |
| CR-04 | Clickwrap agreements show correct entity name | Read | Matches Sunbiz | ☐ | ☐ |
| CR-05 | Electronic W-9 (IRS Rev. March 2024) fill-and-sign works on all 3 tracks | Test applicant | Signed filled PDF stored; last-four only in WordPress | ☐ | ☐ |
| CR-06 | Background check + MVR process works (vendor or manual) | Test candidate | Result recorded | ☐ | ☐ |
| CR-07 | Insurance requirement consistent across agreement, onboarding, orientation | Read | No conflict | ☐ | ☐ |
| CR-08 | Sensitive uploads (ID, license, COI) not publicly accessible | Try direct URL logged out | Denied | ☐ | ☐ |
| CR-09 | Delivery rates set for Duval (JoyRider / WrapRider); wrapping is $30/dozen prorated plus $15 every 100 wraps | Finance → Pay rates and a sample week | Dozen pay and the 100-wrap bonus both show | ☐ | ☐ |
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
| DATA-01 | Firestore PITR enabled | `gcloud firestore databases describe` | Enabled | ☑ | ☐ |
| DATA-02 | Firestore delete protection enabled | Same | Enabled | ☑ | ☐ |
| DATA-03 | Firestore daily backup schedule (≥ 14 days) | `gcloud firestore backups schedules list --database=wrrapd-firebase-db01` | Present | ☑ | ☐ |
| DATA-04 | VM `orders/` + `customers/` synced to versioned GCS hourly | Bucket listing | Latest < 1 h old | ☑ | ☐ |
| DATA-05 | Media bucket configured on Cloud Run (`FIREBASE_STORAGE_BUCKET`) | Env + upload test | Pass | ☑ | ☐ |
| DATA-06 | Lifecycle on `proof/` and `shift-video/` | Bucket config | Present | ☑ | ☐ |
| DATA-07 | Bucket not publicly listable; objects only via token/signed URL | Try logged out | Denied | ☐ | ☐ |
| DATA-08 | Restore drill: Firestore backup → test DB | Do it | Order readable | ☐ | ☐ |
| DATA-09 | Restore drill: VM orders and Buy-through-us data (WB / RO / purchases) from GCS | Do it | Files identical | ☐ | ☐ |
| DATA-10 | Data retention policy written (addresses, messages, videos, IDs) | Doc | Pass | ☐ | ☐ |
| DATA-11 | Firestore indexes exported to repo | `firestore.indexes.json` | Present | ☐ | ☐ |

## A.13 SECURITY

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| SEC-01 | SSH only via IAP; `default-allow-ssh` 0.0.0.0/0 removed | Firewall list | Pass | ☐ | ☐ |
| SEC-02 | RDP 3389 rule deleted | Firewall list | Pass | ☑ | ☐ |
| SEC-03 | Admin MFA or IAP on `/admin` | Login | Pass | ☐ | ☐ |
| SEC-04 | Google Maps browser key restricted by referrer + API | Cloud console | Pass | ☐ | ☐ |
| SEC-05 | No secrets in git history | Secret scan (e.g., gitleaks) | Zero | ☐ | ☐ |
| SEC-06 | `CRON_SECRET`, `INGEST_API_KEY`, internal keys rotated if ever shared in chat/docs | Rotate | Pass | ☐ | ☐ |
| SEC-07 | Ops API keys between WordPress and Command Center rotated and stored only server-side | Inspect | Pass | ☐ | ☐ |
| SEC-08 | WordPress admin accounts reviewed; 2FA on admin users | WP admin | Pass | ☐ | ☐ |
| SEC-09 | WordPress plugins updated; unused deactivated (incl. temporary AI Engine plugin) | WP admin | Pass | ☐ | ☐ |
| SEC-10 | Billing alerts + budget caps on GCP, AI and page-reading APIs (Grok, Gemini, Stability, ZenRows, Bright Data) | Console | Pass | ☐ | ☐ |

## A.14 SURGEON — Monitoring & incident response

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| MON-01 | Uptime checks: api, pay, Cloud Run, wrrapd.com, wrrapd.com/buy, apply, wraprider (Oct 19: 6 live; add /buy and wraprider) | Cloud Monitoring | All configured | ☐ | ☐ |
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
| LEG-08 | Shopper Terms (website + Buy through us) reflect refund practice, service area, timing, buyer of record | Read | Pass | ☐ | ☐ |
| LEG-09 | Privacy page = CWS privacy disclosures | Compare | Pass | ☐ | ☐ |
| LEG-10 | Patent provisional filed before public launch announcement | USPTO receipt 64/159,570, Sep 22, 2026 | Pass — calendar the Sep 22, 2027 non-provisional/PCT deadline | ☑ | ☐ |
| LEG-11 | Trademarks considered/filed | Decision | Pass | ☐ | ☐ |
| LEG-12 | Contractor agreements reviewed by Florida counsel (before first hire) | Memo | Pass | ☐ | ☐ |

---

## A.16 PROCURE — "Buy through us" (copy-paste)

| ID | Check | How to verify | Pass criterion | 1st | 2nd |
|---|---|---|---|---|---|
| BUY-01 | Mode set on purpose (test or live) and recorded | Command Center → Website orders → Settings | Matches Roger's written decision | ☐ | ☐ |
| BUY-02 | Terms reviewed by counsel; version bumped from `-draft` | Counsel email + `terms.js` VERSION | Pass | ☐ | ☐ |
| BUY-03 | Homepage paste form opens `/buy/` with ZIP and link filled in | Desktop + phone | Pass | ☐ | ☐ |
| BUY-04 | Out-of-area ZIP refused before any link can be pasted | 32073, 33602 | Polite refusal | ☐ | ☐ |
| BUY-05 | One link from each of the 10 stores reads correctly (title, photo, price, size/color, hub arrival date, shipping) | Compare with the store page | 10/10, or that store removed from the allowed list | ☐ | ☐ |
| BUY-06 | Limits enforced: $100 item, $300 order, 5 links, quantity 10 | Try to exceed each | Blocked with a clear message | ☐ | ☐ |
| BUY-07 | Clothing / shoes link paused and pointed to the extension | Paste one | Pass | ☐ | ☐ |
| BUY-08 | Electronics item requires the warranty sentence | Paste one | Cannot pay without it | ☐ | ☐ |
| BUY-09 | Shipping rule per store (Amazon $3.99 under $35; free at minimum) | Two carts per store type | Exact | ☐ | ☐ |
| BUY-10 | Bill on pay page = server bill (items, shipping, store tax, wrap, discount, flowers, service tax) | 3 carts | Exact to the cent | ☐ | ☐ |
| BUY-11 | Paid batch appears in the place pool for the right store + hub | Command Center | Pass | ☐ | ☐ |
| BUY-12 | Store order placed by a person within the window; RO number recorded and mapped to the WB batch | Rehearsal | Pass; Orders board shows the order | ☐ | ☐ |
| BUY-13 | Price went up or item out of stock at purchase time → SOP-16 followed | Simulate | Shopper contacted; refund or approve-and-pay | ☐ | ☐ |
| BUY-14 | "Add it manually" → approve-and-pay email → placed → in Orders | Rehearsal | Pass | ☐ | ☐ |
| BUY-15 | Package matched at Hub intake by RO number | Rehearsal | Pass | ☐ | ☐ |
| BUY-16 | Paid order shows in wrrapd.com My orders | Log in with the same email | Pass | ☐ | ☐ |
| BUY-17 | Monthly spend caps + alerts on ZenRows, Bright Data, Gemini, Grok | Each console | Set | ☐ | ☐ |
| BUY-18 | Store return started by Wrrapd for a refused gift | Rehearsal or dry run | Per SOP-14 | ☐ | ☐ |

---

## A.17 Launch countdown

| T-minus | Date (for Nov 2 launch) | Actions |
|---|---|---|
| T-30 d | Sat Oct 3 | First review; decisions in Exhibit B |
| T-14 d | Mon Oct 19 | **This refresh.** Software REDs closed; rehearsals did not start — restart them now |
| T-13 d | Tue Oct 20 | Dress rehearsals begin (extension + Buy through us) |
| T-9 d | Sat Oct 24 | Insurance bound; PAY-01 done; Buy-through-us terms reviewed; mode decided |
| T-7 d | Mon Oct 26 | Friends & family opens if 5 rehearsals are clean; all stations run 1st checks |
| T-72 h | Fri Oct 30 | **Go/No-Go poll** (below); 10 + 5 clean rehearsals required, else move to Nov 9; freeze code (golden tag `golden-beta-2026-10-30`) |
| T-24 h | Sun Nov 1 | Supplies counted; hub run done; backups verified; alerts tested |
| T-2 h | Mon Nov 2, 7:00 ET | Daily open checklist; Amazon smoke test; one `/buy` link read; uptime green |
| T-0 | Mon Nov 2, 9:00 ET | Announce |
| T+1 h | 10:00 ET | First real orders inspected end-to-end in Command Center |
| T+24 h | Tue Nov 3 | First-day review; raise or hold the daily cap |
| T+7 d | Mon Nov 9 | Week review; pricing/delivery-fee data check |

## A.18 The Go/No-Go poll (read aloud, Fri Oct 30)

FLIGHT calls each station; each answers **"GO"** or **"NO-GO + reason"**.

> FLIGHT: "BOOSTER?" — "GO." · "GUIDANCE?" — "GO." · "FIDO?" — "GO." · "INCO?" — "GO." · "GROUND?" — "GO." · "CAPCOM?" — "GO." · "WRAP?" — "GO." · "RECOVERY?" — "GO." · "COMMS?" — "GO." · "CREW?" — "GO." · "SUPPLY?" — "GO." · "DATA?" — "GO." · "SECURITY?" — "GO." · "SURGEON?" — "GO." · "LEGAL?" — "GO." · "PROCURE?" — "GO."
> FLIGHT: "All stations GO. We are GO for Duval beta launch."

**Launch commit criteria (any one = NO-GO):**
1. Any RED item open without a written waiver.
2. Fewer than 10 clean end-to-end rehearsal orders.
3. Any rehearsal where a gift went to the wrong giftee, or a package could not be matched.
4. Insurance not bound, or sales-tax status unresolved.
5. Backups or restore drill not proven.
6. No working alert to Roger's phone.
7. Hub address fails any major carrier.
8. "Buy through us" in **live** mode without counsel-reviewed terms and 5 clean rehearsals (switching it to test mode clears this item for the extension launch).

**Abort / scrub rules after launch (pause new orders via kill switch):**
- Amazon checkout flow broken (EXT smoke test fails).
- Payments failing or charging wrong amounts.
- Two delivery mix-ups in a week.
- Unmatched packages > 1 for more than 24 hours.
- Roger unavailable with no trained backup for the next day's deliveries (assumed true until the first hire — pause new orders and message affected shoppers the same day).

## A.19 Daily flight checklist (every operating day, 10 minutes)

**Morning (before 8:00 ET)**

1. Uptime dashboard all green; no overnight alerts unresolved.
2. Amazon smoke test: cart opt-in appears, ZIP gate works (don't pay).
3. Command Center: today's deliveries, tomorrow's expected arrivals, unmatched packages = 0.
4. Morning sheet received; supplies ≥ 3 days.
5. Pause switches in the right position (ZIP list full; Buy-through-us mode as decided).

**Midday**

6. Hub/PO Box run → intake photos → all matched or quarantined.
7. "Expected but not arrived" list → contact shoppers as needed.
8. Buy through us: every ready place pool purchased and its RO number recorded; manual additions answered.

**Evening**

9. All delivered orders have photo + GPS + time; no order stuck in "out for delivery".
10. Service desk inbox zero (or replied with a time).
11. Refunds/cancellations logged; backups ran (DATA-04 timestamp < 1 h).

---

# Exhibit B — Questions for Roger

**Answered Oct 3–19, 2026** — see the Decisions log in §1.2a.

**Open now (please answer this week):**

1. **Buy through us — mode:** keep it **live** on the public homepage now, or switch to **test** (preview code only) until counsel review and 5 rehearsals? (R11)
2. **Buy through us — purchasing:** which card and which store accounts are used to place store orders? Who else may place them? How fast after payment must a store order be placed?
3. **Buy through us — card fees on merchandise:** absorb (~3% of the item price) as acquisition cost, or add a small purchasing line? (R13)
4. **Insurance:** broker name and date for a quote; is anything bound? (R9)
5. **PAY-01:** has a live $1 charge + refund been done? (The $8.58 refund asked about on Oct 5 — did it land?)
6. **Carrier tests:** has any UPS, FedEx, Amazon Logistics or OnTrac package arrived at 150 Busch Dr #26067? (R1)
7. **Rehearsals:** any real orders placed since Oct 5 that we should record?
8. **Label printer:** arrived and working?
9. **Admin login:** set up with an authenticator app? Mobile number for text alerts?
10. **SSH:** limit to your home IP + Google IAP, or leave key-only?
11. **Sales tax (CPA):** on Buy-through-us purchases, should Wrrapd pay the store's sales tax, or buy for resale with the 2026 resale certificate and remit tax itself?
12. **Patent:** should the copy-paste flow be added to the non-provisional (deadline Sep 22, 2027)?
13. **Second hub:** any plan before the holidays? Adding one is now a Command Center setting, but it needs its own carrier tests, pickup routine, contractors and insurance.
14. **Support hours** you can commit to during beta.
15. **Order-number format** for the dummy-order cleanup.

---

# Exhibit C — Evidence captured on Oct 19, 2026 (with Oct 3 for comparison)

| Check | Oct 3 | Oct 19 |
|---|---|---|
| `git log` head | `2e0ac4c` (extension 3.0.11) | `45b26fe` — 152 commits since the Oct 5 review |
| Extension on Chrome Web Store | 3.0.11 | **3.0.14** (approved Oct 8; listing `lobngnjcjeimefihnobdmocicopikoip`); repo `manifest.json` 3.0.14 |
| `https://wrrapd.com/` | 200; MU `2026-09-22-hire-chrome-gate` | 200; MU **`2026-10-19-header-cta-2s`**, landings `v30`, popup `extension-flow-demo-v5` |
| `https://wrrapd.com/buy/` | — | 200; Buy-through-us mode **live** |
| `https://wrrapd.com/privacy/` | "Last updated April 23, 2026" | Body "Last updated: October 3, 2026"; search description still April 23 |
| `https://apply.wrrapd.com/wraprider/` | 200 | 200 |
| `https://pros.wrrapd.com/` | 200 "Under construction" | **301 → `https://apply.wrrapd.com`** (path not kept) |
| `https://pros.wrrapd.com/wraprider-onboarding/` | 404 | 301 → apply homepage |
| `https://api.wrrapd.com/health` | 200 | 200 |
| `https://api.wrrapd.com/health/backup` | — | `ok`, last backup 2026-10-19 23:07 UTC (7:07 PM ET) |
| `https://pay.wrrapd.com/checkout` | 200 | 200 |
| `https://wraprider.wrrapd.com/wraprider` | 200 | 200 |
| PM2 | `wrrapd-server` 153 restarts | `wrrapd-server` online, 302 restarts, **0 unstable**; `wrrapd-api` 11 |
| VM orders | 209 files | 214 files |
| VM disk | 44% of 49 GB | 50% of 49 GB |
| Cloud Run `wrrapd-tracking` | no min instances | revision `00198`, still no min instances |
| Cloud Run storage env | missing | `FIREBASE_STORAGE_BUCKET` set (Oct 3) |
| Firestore `wrrapd-firebase-db01` | PITR off, delete protection off, no backups | **PITR ON, delete protection ON, daily backups kept 14 days** |
| Ops backups bucket | none | `gs://wrrapd-ops-backups`: 398 objects, 51 MB, hourly |
| Cloud Scheduler | weekly payouts only | `wrrapd-weekly-payouts`, `wrrapd-wrapstar-morning`, `wrrapd-expire-delivery-preferences`, `wrrapd-order-reconcile`, `wrrapd-hub-exceptions` — all enabled |
| Uptime checks | none | 6: home, api health, pay checkout, apply, Command Center, order backups |
| VM firewall | SSH + RDP open to 0.0.0.0/0 | RDP rule gone; `default-allow-ssh` 0.0.0.0/0 still present alongside `allow-ssh-from-iap` |
| Hub address in extension | PO BOX 26067, 32226-6067 | 150 BUSCH DR #26067, 32218; hub `jax-1` in `data/delivery-hubs.json` |
| Service area | 34 Duval ZIPs, hard rule | Same 34 stored; public list filtered to within 50 miles of an active hub |
| Volume discount | none | 2–4 wraps 10%, 5+ wraps 15% (`wrrapd-pricing-config.json`) |
| Server ZIP check at charge | none | `/buy`: yes. Extension charge routes: no |
| Stripe customer routes | test key, trusted client total | Server-priced, but still callable with the test key |
| Buy-through-us config | — | 5 links, $100/item, $300/order, 10 stores, quote wait 20 min, return window 15 days, electronics allowed, team alerts to admin@wrrapd.com |
| CI (`.github/workflows/tests.yml`) | added Oct 3 | Pay server `node --test` (~18 files, ~87 tests), Command Center type-check, extension build + 3 fixture checks |
