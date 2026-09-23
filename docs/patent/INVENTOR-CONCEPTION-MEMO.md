# Inventor Conception Memo (Sole Inventor)

**Purpose:** Establish that **you** (a natural person) conceived the claimed coordination-layer inventions. Cursor / other AI tools were implementation aids only — **not inventors**. Keep this memo with your filing records. Do **not** file this memo at the USPTO. Do **not** paste Cursor chat logs into the patent specification.

**Date of memo:** _______________  
**Inventor legal name:** _______________  
**Residence (City, State, Country):** _______________  
**Relationship to company:** Founder / _______________ of **Wrrapd Inc.**

---

## 1. Sole inventorship statement

I am the sole human who conceived the inventions described in the provisional application titled approximately:

> SYSTEMS AND METHODS FOR BROWSER-MEDIATED MULTI-RETAILER GIFT FULFILLMENT ORCHESTRATION WITH SEPARATE SERVICE PAYMENT, HUB ROUTING, AND PROOF-OF-SERVICE TRACKING

I used coding assistants (including Cursor) only to **implement** software from designs I had already conceived and directed. No AI system is an inventor. No other person contributed to **conception** of the claim families listed below. If that changes, I will update inventorship before non-provisional filing.

**Signature:** _________________________ **Date:** _________

---

## 2. What I conceived (human language — fill in your words)

For each family, write the problem you saw, the mechanism you chose, and approximate first date you had it clear (note, wireframe, pitch, commit, live test). Strike any family you did **not** conceive.

### Family 1 — Checkout injection
- **Problem I saw:**  
- **Mechanism I chose:** Browser extension detects third-party cart/checkout and injects wrap election + separate pay UI without a retailer SDK/API.  
- **What I told tools to build / what I rejected:**  
- **First clear date / evidence:**  

### Family 2 — Dual checkout / address hijack
- **Problem I saw:**  
- **Mechanism I chose:** Charge wrap on Wrrapd’s rail; rewrite merchant ship-to to a hub/node under user authorization; giftee address collected separately.  
- **What I told tools to build / what I rejected:**  
- **First clear date / evidence:**  

### Family 3 — Multi-retailer combo
- **Problem I saw:**  
- **Mechanism I chose:** Items from multiple merchants can feed one wrap job / one recipient drop (or scheduled consolidation).  
- **What I told tools to build / what I rejected:**  
- **First clear date / evidence:**  
- **Note:** Be honest if this is still partly preferred embodiment vs live.

### Family 4 — Proof-of-wrap / proof-of-service loop
- **Problem I saw:**  
- **Mechanism I chose:** Assign job → require photo and/or video documentation of wrap/delivery → customer tracking sees proof; contractor gated/paid on documentation.  
- **What I told tools to build / what I rejected:**  
- **First clear date / evidence:**  
- **Note:** Distinguish live photo GPS tracking from contractual/preferred video audit trail.

### Family 5 — Prompt/upload → printable paper bound to order ID
- **Problem I saw:**  
- **Mechanism I chose:** AI or upload art → cloud print-ready asset keyed to order + product identity → travels with fulfillment ticket.  
- **What I told tools to build / what I rejected:**  
- **First clear date / evidence:**  

### Family 6 — Capacity / surge matching (if conceived)
- **Problem I saw:**  
- **Mechanism I chose:** Holiday demand vs wrapper capacity windows / SLA routing.  
- **Status:** Conceived / Partially conceived / Not yet (strike from claims if not conceived).  
- **First clear date / evidence:**  

---

## 3. Cursor / AI use (one paragraph — edit to truth)

> I conceived the product and system architecture (shopper uses retailer sites as usual; wrap option appears via extension; Wrrapd charges separately; packages ship to a wrapping node; contractors document work; customer tracks delivery). I directed Cursor and similar tools with specific implementation instructions, reviewed and rejected unsuitable designs, and made the flows work in production. The chat logs show **implementation direction**, not inventorship by the model. I can explain each claimed step without needing the chat history to understand *what* the invention is.

---

## 4. Other humans check

List anyone who might have contributed a *claimed idea* (not mere coding labor or pixels):

| Person | Role | Contributed a claimed idea? (Y/N) | If Y — what idea? |
|--------|------|-----------------------------------|-------------------|
| | | | |

If any **Y**, stop and get inventorship advice before filing.

---

## 5. Company ownership (do this the same week you file)

- [ ] Provisional filed in my name **or** Wrrapd Inc. as applicant (pick one strategy and stick to it).  
- [ ] **Assignment** from me → **Wrrapd Inc.** executed and recorded (or ready to record) so the **company owns the priority date**.  
- [ ] Repo / IP assignment agreements cover code copyright separately from patent inventorship.

Patent inventorship = who conceived.  
Copyright / company ownership = who owns the assets. Both matter; they are not the same.

---

## 6. One paragraph for counsel (copy when converting)

> I am the sole human who conceived the checkout-injection, dual-transaction, wrap-node routing, AI/upload design binding, multi-source order coordination, and proof-of-service tracking workflow. I used the Cursor coding assistant to implement software from that design. No other person contributed to conception of the claims we will file. Do not name any AI system as inventor. Please treat the provisional as an omnibus seed to be split into multiple non-provisionals (and PCT) within 12 months.

---

## 7. Evidence folder (keep offline / encrypted)

- Dated notes, emails, wireframes, pitch decks  
- First live dates for Target/Amazon/etc. flows  
- Commit messages that show *your* direction of the architecture  
- Cursor chats (evidence of direction — **not** filed at USPTO)  
- Copy of provisional PDF + USPTO filing receipt once filed  
- Signed assignment to Wrrapd Inc.
