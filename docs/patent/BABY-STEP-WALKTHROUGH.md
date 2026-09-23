# WRRAPD DIY PROVISIONAL — BABY-STEP WALKTHROUGH

**Read this file top to bottom. Do not skip steps. Check every ☐ before moving on.**

**Not legal advice.** This is an operational playbook so you do not miss a USPTO click.

**Goal today/this week:** File one omnibus U.S. provisional + save the receipt + assign to Wrrapd Inc. + calendar the 12-month deadline.

**What this filing is:** A priority-date timestamp / seed for later patents.  
**What this filing is not:** MAD, troll armor, a trademark, or a right to sue.

---

# PHASE 0 — SETUP (30–60 minutes)

## Step 0.1 — Create your evidence folder on your computer

On your Windows PC (or Mac), create this exact folder tree:

```
Documents/
  WRRAPD-PATENT-FILING/
    00-INVENTOR-MEMO/
    01-SPEC-PDF/
    02-DRAWINGS-PDF/
    03-USPTO-RECEIPTS/
    04-ASSIGNMENT/
    05-SCREENSHOTS-OF-FILING/
    06-PRIVATE-EVIDENCE/          ← NEVER upload this to USPTO
      cursor-chats/
      early-notes/
      wireframes/
```

☐ Done

## Step 0.2 — Copy files from the GCP repo to your PC

From the monorepo (or GitHub after pull), copy these into the folders above:

| Source in repo | Put in |
|----------------|--------|
| `docs/patent/INVENTOR-CONCEPTION-MEMO.md` | `00-INVENTOR-MEMO/` |
| `docs/patent/filing-kit/01-SPECIFICATION-FOR-USPTO.html` | `01-SPEC-PDF/` |
| `docs/patent/filing-kit/01-SPECIFICATION-FOR-USPTO.txt` | `01-SPEC-PDF/` (backup) |
| `docs/patent/figures/DRAWINGS-PRINT.html` | `02-DRAWINGS-PDF/` |
| `docs/patent/DIY-FILING-CHECKLIST.md` | root of `WRRAPD-PATENT-FILING/` |
| This file (`BABY-STEP-WALKTHROUGH.md`) | root of `WRRAPD-PATENT-FILING/` |

☐ Done

## Step 0.3 — USPTO account

1. Go to: https://patentcenter.uspto.gov  
2. If you do not have an account → create one with **your personal email** (the one you check every day).  
3. Complete identity verification if prompted.  
4. Log in once successfully, then log out and log in again to confirm.

☐ USPTO Patent Center login works

## Step 0.4 — Payment method

Have ready:
- Credit/debit card for USPTO fees, **or**
- USPTO deposit account (if you have one — most DIY filers use a card)

☐ Payment method ready

---

# PHASE 1 — INVENTOR MEMO (do this BEFORE filing)

**Why:** Proves *you* conceived the invention. Cursor is a tool, not an inventor.

## Step 1.1 — Open the memo

Open `00-INVENTOR-MEMO/INVENTOR-CONCEPTION-MEMO.md` (or print it and write by hand).

## Step 1.2 — Fill ONLY in your own words

For each family you conceived, write:
- Problem you saw
- Mechanism you chose
- What you told Cursor vs what you threw away
- First date / evidence

**Strike Family 6 (surge)** if you did not personally conceive capacity matching.

## Step 1.3 — Sign and date

Print → wet signature → photo/scan into `00-INVENTOR-MEMO/SIGNED-memo.pdf`

☐ Inventor memo signed and saved  
☐ **Do NOT upload the memo to Patent Center**

## Step 1.4 — Private evidence (optional but smart)

Copy into `06-PRIVATE-EVIDENCE/` (never file these):
- Key Cursor chats that show *you directing* architecture
- Early notes / emails / wireframes
- First commit messages describing the coordination loop

☐ Private evidence folder populated (or skipped consciously)

---

# PHASE 2 — MAKE THE SPECIFICATION PDF (the document USPTO will hold)

## Step 2.1 — Open the print-ready HTML

On your PC, open in **Chrome** or **Edge**:

```
01-SPEC-PDF/01-SPECIFICATION-FOR-USPTO.html
```

Double-click the file, or drag it into the browser.

## Step 2.2 — Print to PDF (exact clicks)

1. Press **Ctrl+P** (Windows) or **Cmd+P** (Mac)  
2. **Destination:** Save as PDF (or Microsoft Print to PDF)  
3. **Pages:** All  
4. **Layout:** Portrait  
5. **Margins:** Default  
6. **Options:**  
   - ☐ Headers and footers → **OFF** (uncheck)  
   - ☐ Background graphics → **OFF**  
7. Click **Save**  
8. Filename: `Wrrapd-Provisional-Specification.pdf`  
9. Save into `01-SPEC-PDF/`

## Step 2.3 — Verify the PDF

Open the PDF and confirm:
- ☐ Title appears near the top  
- ☐ Embodiments A–N are present (scroll — do not cut pages)  
- ☐ Claims 1–15 present  
- ☐ Abstract present  
- ☐ No yellow browser banners printed on pages  
- ☐ File size roughly 50KB–2MB (not empty)

**If text is cut off:** reopen HTML, Zoom to 100%, try again with “More settings” → Paper size Letter.

☐ Spec PDF ready: `Wrrapd-Provisional-Specification.pdf`

---

# PHASE 3 — MAKE THE DRAWINGS PDF (FIGS. 1–10)

## Step 3.1 — Open drawings HTML

Open in Chrome/Edge:

```
02-DRAWINGS-PDF/DRAWINGS-PRINT.html
```

You will see a yellow bar: “PRINT INSTRUCTIONS…” — that bar will **not** print.

## Step 3.2 — Print all figures to one PDF

1. **Ctrl+P** / **Cmd+P**  
2. Destination: **Save as PDF**  
3. Pages: **All**  
4. Layout: Portrait  
5. Margins: Default  
6. Background graphics: **OFF**  
7. Save as: `Wrrapd-Provisional-Drawings-FIGS-1-10.pdf`  
8. Location: `02-DRAWINGS-PDF/`

## Step 3.3 — Verify drawings

Open PDF and confirm **10 pages** (or 10 figure sheets):
- ☐ FIG. 1 Architecture  
- ☐ FIG. 2 Hub-ship flow  
- ☐ FIG. 3 Amazon multi-address  
- ☐ FIG. 4 AI design pipeline  
- ☐ FIG. 5 Fingerprint sync  
- ☐ FIG. 6 Ingest / preference  
- ☐ FIG. 7 WrapStar proof loop  
- ☐ FIG. 8 Dimension tiers (preferred)  
- ☐ FIG. 9 Two-phase commit (preferred)  
- ☐ FIG. 10 Video audit (preferred)  

**Minimum acceptable if rushed:** FIGS. 1, 2, and 7 only — but prefer all 10.

☐ Drawings PDF ready

---

# PHASE 4 — OPTIONAL PRODUCT SCREENSHOTS (for YOUR evidence — not USPTO drawings)

**Important distinction:**

| Type | Where it goes | Purpose |
|------|---------------|---------|
| **FIGS. 1–10 line drawings** | Upload to USPTO as Drawings | Patent enablement |
| **Live product screenshots** | `06-PRIVATE-EVIDENCE/` only | Prove dates / conception / diligence |
| **Patent Center screenshots** | `05-SCREENSHOTS-OF-FILING/` | Prove what you filed |

**Do NOT upload Target/Amazon UI screenshots as formal patent drawings** (trademark clutter, UI changes, unnecessary risk). Use the generic line drawings we made.

## Step 4.1 — Evidence screenshots (private folder only)

If you want a diligence pack, capture into `06-PRIVATE-EVIDENCE/` with filenames:

```
2026-XX-XX_target-cart-optin.png
2026-XX-XX_pay-wrrapd-panel.png
2026-XX-XX_hub-address-filled.png
2026-XX-XX_ai-design-modal.png
2026-XX-XX_track-page.png
2026-XX-XX_wrapstar-proof.png
```

How to capture (Windows): **Win+Shift+S** → select region → paste into Paint → Save PNG.

☐ Skipped **or** evidence screenshots saved privately

---

# PHASE 5 — PATENT CENTER FILING (the critical path)

**Block 45–90 minutes. Do not multitask. Have both PDFs open and ready.**

## Step 5.1 — Start submission

1. Go to https://patentcenter.uspto.gov and **log in**  
2. Look for **New** / **File a new submission** / **Submit application** (wording varies slightly)  
3. Choose application type: **Utility**  
4. Choose: **Provisional**  

☐ On provisional filing path

## Step 5.2 — Application Data Sheet method

You will see three cards (you already saw this screen):

1. Web ADS  
2. Upload ADS (PDF)  
3. No ADS, or Attach ADS (PDF)

### → Click **Web ADS**

☐ Web ADS selected

**Take screenshot:** Save as `05-SCREENSHOTS-OF-FILING/01-chose-web-ads.png`

---

## Step 5.3 — Web ADS fields (fill EVERYTHING carefully)

### A. Application information
- **Title of invention:** paste exactly:

```
SYSTEMS AND METHODS FOR BROWSER-MEDIATED MULTI-RETAILER GIFT FULFILLMENT ORCHESTRATION WITH SEPARATE SERVICE PAYMENT, HUB ROUTING, AND PROOF-OF-SERVICE TRACKING
```

- **Application type:** Provisional (should already be set)

### B. Inventor (YOU — sole inventor if memo says so)

Add inventor:
- **Given name** (first): e.g. Roger  
- **Family name** (last): e.g. Phillips  
- **Middle name** if any  
- **Residence City**  
- **Residence State** (US)  
- **Residence Country:** US  
- **Mailing address** (can match correspondence)

**Do NOT** add Cursor, Claude, GPT, or “Wrrapd AI”.

☐ Only natural person inventor(s) listed

### C. Correspondence / Customer Number
- Use your email and mailing address where USPTO will send the filing receipt  
- If you have a Customer Number, use it; if not, enter address manually

### D. Applicant
**For tonight’s filing (per your decision):** Applicant = **Roger Phillips** (same as sole inventor).  
Do **not** list Wrrapd Inc. as applicant tonight unless you change your mind.

Company license/assignment can wait until investors ask — while you remain 100% owner that is an afternoon fix. Do not tell employees/WrapStars “the company owns all IP” if that is not true.

☐ Applicant = Roger Phillips (personal)

### E. Entity status
- If you qualify → **Micro entity** (read USPTO micro-entity certification carefully)  
- Else if company qualifies → **Small entity**  
- Else → Large  

☐ Entity status selected (and certification completed if micro)

### F. Save Web ADS

Click **Save** / **Continue** so data is not lost.

**Take screenshot:** `05-SCREENSHOTS-OF-FILING/02-web-ads-complete.png`

---

## Step 5.4 — Upload documents

Go to Documents / Attachments section.

### Upload 1 — Specification
1. Click **Add document** / **Upload**  
2. Document type: look for **Specification** or **Provisional specification** or similar  
3. Choose file: `Wrrapd-Provisional-Specification.pdf`  
4. Upload → wait for success checkmark  

### Upload 2 — Drawings
1. Add another document  
2. Document type: **Drawings**  
3. File: `Wrrapd-Provisional-Drawings-FIGS-1-10.pdf`  
4. Upload → success  

**Do NOT upload:**
- Inventor memo  
- Cursor chats  
- Live retailer screenshots  
- Source code zip  
- This walkthrough  

**Take screenshot:** `05-SCREENSHOTS-OF-FILING/03-documents-uploaded.png`

☐ Spec uploaded  
☐ Drawings uploaded  

---

## Step 5.5 — Review checklist on screen

Before fees, Patent Center usually shows a validation panel. Confirm:
- ☐ Application is **Provisional**  
- ☐ Title correct  
- ☐ Inventor name spelling matches ID  
- ☐ Spec attached  
- ☐ Drawings attached (or you consciously filed without — not recommended)  
- ☐ Entity status correct  

If any red error: fix before paying.

---

## Step 5.6 — Fees and payment

1. Review fee calculation (micro / small / large provisional fee — amounts change; trust the USPTO screen)  
2. Enter payment  
3. Do **not** close the browser mid-payment  

**Take screenshot:** `05-SCREENSHOTS-OF-FILING/04-fee-screen.png`

☐ Paid  

---

## Step 5.7 — SUBMIT

1. Click the final **Submit** / **Submit application** button  
2. Wait for confirmation page  

**Take screenshot immediately:** `05-SCREENSHOTS-OF-FILING/05-submission-confirmation.png`

---

## Step 5.8 — Download receipts (DO NOT SKIP)

On confirmation / later in Patent Center → Application → Documents:

Download and save into `03-USPTO-RECEIPTS/`:

| File | Save as |
|------|---------|
| Filing receipt | `FILING-RECEIPT.pdf` |
| Application number acknowledgment | `APP-NUMBER.txt` (or PDF) |
| Fee receipt | `FEE-RECEIPT.pdf` |
| Exact submitted spec (if available) | `AS-FILED-spec.pdf` |
| Exact submitted drawings | `AS-FILED-drawings.pdf` |

Write on a sticky note and in your password manager:

```
Provisional App No: ________________
Filing Date: ________________
Title: (short) Wrrapd multi-retailer gift orchestration
12-month deadline: ________________  (= filing date + 1 year)
```

☐ Receipts downloaded  
☐ Deadline calendared in Google Calendar + phone reminder at Month 9, Month 11, and Month 12−14 days  

---

# PHASE 6 — SAME WEEK LEGAL HOUSEKEEPING

## Step 6.1 — Assignment to Wrrapd Inc.

Same week (do not wait months):
1. Sign a short **Assignment of Patent Application** from you → Wrrapd Inc. covering this provisional and inventions disclosed therein  
2. Save PDF in `04-ASSIGNMENT/`  
3. Optionally record assignment at USPTO later (counsel can help)  

☐ Assignment signed (or scheduled with counsel this week)

## Step 6.2 — Trademark refile (separate from patent)

This is **not** part of Patent Center provisional upload.
- Re-file WRRAPD / design mark in Classes **016, 035, 039, 042** (confirm with trademark counsel or USPTO TEAS)
- Track that deadline separately  

☐ Trademark action started **or** calendared within 14 days

---

# PHASE 7 — WHAT SUCCESS LOOKS LIKE

You are done with the provisional filing when **all** of these are true:

1. ☐ USPTO filing receipt with application number + filing date  
2. ☐ Spec PDF + drawings PDF saved as filed  
3. ☐ Filing screenshots saved  
4. ☐ Inventor memo signed (private)  
5. ☐ 12-month conversion deadline on calendar  
6. ☐ Assignment to Wrrapd Inc. signed or firmly scheduled  

You are **not** done with the Uber-style IP strategy — that continues with old-patent buys, marks, trade secrets, and month-12 split filings.

---

# ALGORITHM CHEAT SHEET (for your brain while filing)

## Master loop (what you invented)

```
RETAILER CART/CHECKOUT
        │
        ▼
EXTENSION detects DOM → wrap election → Limited Agency T&Cs
        │
        ▼
SEPARATE PAY (pay.wrrapd.com / Stripe)  ← Phase 1
        │
        ▼
REWRITE ship-to → HUB (+ lock + conflict guard)
        │
        ▼
USER places RETAILER order → package goes to HUB  ← Phase 2
        │
        ▼
OPTIONAL: AI/upload design bound to order+product ID
        │
        ▼
TRACKING ingest → schedule (retailer date + offset)
        │
        ▼
WRAPSTAR wrap + GPS + proof media
        │
        ▼
CUSTOMER /track/{token}
```

## Cart fingerprint sub-algorithm

```
fingerprint = hash(productId + title + qty for each line)
if fingerprint != stored:
    clear paymentSuccess
    require gift choice review
if payment succeeds:
    stored = fingerprint
```

## Pay-lock merge sub-algorithm

```
id = canonicalize(externalOrderId)
open = findOpenOrders(id)
if open and incoming is staging and open is pay-backed:
    do not overwrite giftee/schedule/snapshot
merge supplemental fields
delete duplicate open docs
```

---

# IF SOMETHING GOES WRONG

| Problem | What to do |
|---------|------------|
| Browser crashed during payment | Log back into Patent Center → check if application number exists before paying twice |
| Wrong inventor spelling | Contact USPTO / counsel ASAP; may need corrective filing |
| Forgot drawings | You can often file a follow-on document if still provisional window — but better to include drawings in first submission |
| Uploaded wrong PDF | If not yet submitted, replace. If already submitted, save what was filed; counsel can advise on supplemental filings |
| Micro-entity unsure | Choose **Small entity** rather than risk a false micro certification |

---

# STOP RULES (read twice)

1. **Do not** name AI as inventor.  
2. **Do not** upload Cursor chats or retailer UI screenshots as patent drawings.  
3. **Do not** treat this provisional as permission to sue anyone.  
4. **Do not** miss the 12-month date.  
5. **Do** assign to Wrrapd Inc. the same week.  
6. **Do** keep building preferred embodiments during the 12 months.

---

# YOUR NEXT PHYSICAL ACTION (right now)

1. Create the `WRRAPD-PATENT-FILING` folder tree (Phase 0).  
2. Fill and sign the inventor memo (Phase 1).  
3. Open `01-SPECIFICATION-FOR-USPTO.html` → Print → Save as PDF (Phase 2).  
4. Open `DRAWINGS-PRINT.html` → Print → Save as PDF (Phase 3).  
5. Only then open Patent Center (Phase 5).

When you finish Phase 2, reply with: **“Spec PDF done”** and we proceed to verify your PDF checklist before you touch Patent Center.
