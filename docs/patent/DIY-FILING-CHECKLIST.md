# DIY Provisional Filing Checklist — Wrrapd Coordination Layer

**Not legal advice.** This is a practical checklist for Patent Center. Confirm micro-entity eligibility and inventor inventorship yourself (or with counsel).

**Specification file:** `docs/patent/PROVISIONAL-SPECIFICATION.md`  
**Inventor memo (do not file at USPTO):** `docs/patent/INVENTOR-CONCEPTION-MEMO.md`  
**Convert to PDF before upload** (Word → PDF, or Pandoc, or print-to-PDF). USPTO wants PDF for the specification.

---

## Reality check: what one provisional is (and is not)

A U.S. provisional is a **dated placeholder** the Office holds for **12 months**. It is not examined, never becomes a patent by itself, and gives **no right to sue**. On month 13, if you have not filed a non-provisional (and usually a PCT) that properly claims priority, the date dies.

| Uber-style pillar | One provisional? |
|---|---|
| MAD / countersue Amazon or a funded clone | **No** — need issued claims (and preferably bought old issued patents) |
| Troll defense | **Almost no** — beaten with *existing* prior art + publications, not a new 2026 placeholder |
| Diligence / raise “IP insurance” | **Only a little** — investors like a filing; they do not treat one provisional as a shield |

**What this omnibus provisional *is* for:** priority date on *your* coordination-layer inventions, written thick enough to **split later** into multiple non-provisionals + PCT (checkout injection; dual checkout / hub route; multi-retailer combo; proof loop; AI/upload→order-bound print; surge/capacity if conceived).

**Correct minimum this month:** omnibus provisional **+** trademark refile (WRRAPD / design mark in the right classes). That is the option on the strategy — not the whole strategy.

**Still separate workstreams:** buy old checkout/extension/print patents; design patents; copyright; trade secrets; defensive publications; FTO; aggregator membership.

---

## Before you click Submit

### 0. Inventor memo + Cursor
- Complete `INVENTOR-CONCEPTION-MEMO.md` in **your own words**.
- **Do not** name Cursor, Claude, GPT, or any model as inventor. AI is a tool; only natural persons invent (USPTO / Federal Circuit).
- Inventorship test = **who conceived** the method/system — not who typed the syntax. Cursor = reduction to practice / build aid if you directed the architecture.
- Keep Cursor chats offline as evidence of *your direction*. Do **not** put them in the patent PDF.
- If you cannot explain each claimed family without the chat log, refine the memo first — then file.

### 1. Decide inventorship (do this carefully)
- If you alone conceived the claim families → **sole inventor** on Web ADS.
- Exact legal name must match ID.
- Other humans (contractor, designer, WrapStar) who contributed a *claimed idea* may be joint inventors — wrong inventorship can invalidate. Cursor cannot be a joint inventor; a person can.
- **Same week as filing:** assign the application to **Wrrapd Inc.** so the company owns the priority date (inventorship ≠ copyright ≠ company ownership).

### 2. Applicant / ownership
- **Option A:** File in inventor name(s), assign to Wrrapd Inc. later.
- **Option B:** File with Wrrapd Inc. as applicant (assignment or employment agreement should exist).
- Pick one and be consistent on Web ADS.

### 3. Entity status
- Check USPTO **micro-entity** rules (gross income + application caps + no large-entity assignment obligations).
- If you qualify → select micro-entity (lowest fee).
- If not → small entity (Wrrapd Inc. often qualifies as small if under employee/revenue thresholds) or large.

### 4. Prepare files
| File | Format | Notes |
|------|--------|-------|
| Specification | **PDF** | Export from `PROVISIONAL-SPECIFICATION.md` / Word. Remove markdown `#` clutter if possible — clean numbered sections look more professional. |
| Drawings (optional but recommended) | **PDF** | FIGS. 1–10 as simple black line art. Even hand sketches are OK for provisional. |
| Abstract | Included in spec | First page of abstract section is fine. |

**Do NOT include:** source code dumps, secrets (.env), Stripe keys, customer PII, or trade-secret matching algorithms in detail.

### 5. Title for Web ADS (copy-paste)
```
SYSTEMS AND METHODS FOR BROWSER-MEDIATED MULTI-RETAILER GIFT FULFILLMENT ORCHESTRATION WITH SEPARATE SERVICE PAYMENT, HUB ROUTING, AND PROOF-OF-SERVICE TRACKING
```

---

## Patent Center steps (provisional)

1. Sign in at [https://patentcenter.uspto.gov](https://patentcenter.uspto.gov)
2. **New submission** → **Utility** → **Provisional**
3. **Application Data Sheet:** choose **Web ADS** (as previously advised)
4. Fill Web ADS:
   - Inventor(s) + residence
   - Correspondence address + email (you will get filing receipt here)
   - Applicant / assignee if any
   - Entity status
   - Title (above)
5. **Upload documents:**
   - Specification PDF (required)
   - Drawings PDF (strongly recommended)
6. Review document list — ensure application is marked **provisional**
7. Calculate fees → pay
8. **Submit**
9. **Download and save forever:**
   - Filing receipt (application number + filing date)
   - Submission receipt / acknowledgment
   - Exact PDF(s) as filed

---

## After filing (same day)

1. Put the **filing date + application number** in your calendar and password manager.
2. Set three reminders:
   - **Month 9:** “Start non-provisional / counsel engagement”
   - **Month 11:** “Draft conversion package”
   - **Month 12 − 2 weeks:** **HARD DEADLINE** — file non-provisional and/or PCT claiming priority
3. Continue building preferred embodiments (dimension lookup, two-phase refund, video audit). New matter can go into:
   - the non-provisional at month 12, and/or
   - **additional provisionals** if something is truly new (then consolidate at conversion)
4. Do **not** publicly disclose trade secrets you withheld from the spec.
5. Optional: stamp `docs/patent/` with “Filed provisional App. No. XX/XXX,XXX on YYYY-MM-DD” (after you have the number).

---

## What this provisional is designed to do (Uber-shield alignment)

| Goal | How this filing helps |
|------|------------------------|
| **MAD / countersuit ammo** | Priority date on coordination layer (checkout injection, hub hijack, dual payment, proof loop, AI→order binding) |
| **Troll armor** | Dated, detailed enablement of what you actually ship + preferred embodiments |
| **Investor / IPO insurance** | Data-room artifact: “pending provisional on coordination layer” |
| **Room to build 12 months** | Preferred embodiments reserve dimension/refund/video/machine territory without false “already built” claims |

**What it does *not* do alone:** replace acquired prior-art patents, trademarks, FTO memo, or non-provisional claim craftsmanship. Those remain parallel workstreams from the strategy memo.

---

## Parallel IP moves (same 30 days — not part of USPTO click-path)

1. **Trademarks:** Re-file WRRAPD / design mark in Classes 016, 035, 039, 042 (and any others counsel recommends). Abandoned Class 016 is an open door.
2. **Invention harvest:** Dated notes of first checkout injection, first multi-retailer combo, first WrapStar proof gate (inventor notebooks).
3. **Defensive publications (later):** Publish non-core DOM heuristics you will *not* patent — after provisional is filed.
4. **Counsel for conversion:** Budget for non-provisional at month 9–12 even if provisional was DIY.

---

## Converting the Markdown → USPTO PDF (quick options)

**Option A — Word (easiest)**  
1. Open `PROVISIONAL-SPECIFICATION.md` in VS Code / Cursor  
2. Copy into Microsoft Word  
3. Apply Heading styles, Times New Roman or Arial 12pt, 1.5" left margin if you want classic patent look (not required for provisional)  
4. Save as PDF  

**Option B — Pandoc (if installed)**  
```bash
cd /home/phill/wrrapd-GCP/docs/patent
pandoc PROVISIONAL-SPECIFICATION.md -o Wrrapd-Provisional-Specification.pdf
```

**Option C — Browser print**  
Paste into a clean HTML/Markdown preview → Print → Save as PDF.

---

## Figures — minimum viable set (if short on time)

If you only draw **three** figures before filing, prioritize:

1. **FIG. 1** — Architecture (Retailer → Extension → Pay API → Tracking → Hub/WrapStar → Customer track page)  
2. **FIG. 2** — Hub-ship checkout flow (opt-in → pay → autofill hub → place retailer order)  
3. **FIG. 7** — Proof loop (assign → wrap → GPS → proof upload → customer track)

Label boxes with black ink; no color required.

---

## Fee reality check

USPTO provisional fees change — look up current **micro / small / large** provisional filing fee on uspto.gov the day you file. Budget roughly:

- Micro-entity: lowest hundreds of USD  
- Small entity: higher  
- Large entity: highest  

Plus any drawing help / attorney 15-minute inventorship check if you want cheap insurance.

---

## When to get a human patent attorney involved *before* DIY submit

Pause and call counsel if:

- Multiple co-founders disagree on inventorship  
- You already publicly disclosed the invention in detail >1 year ago (US grace period issues; foreign absolute novelty)  
- An investor requires assignment / perfection before filing  
- You plan to sue someone in the next year (prosecution strategy matters)

Otherwise: **file the provisional with this specification, keep building, convert with counsel inside 12 months.**
