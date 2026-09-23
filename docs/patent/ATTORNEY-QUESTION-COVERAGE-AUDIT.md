# Attorney Q&A Coverage Audit — Is the Provisional Complete?

**Purpose:** Map counsel’s seven questions (and the patent motivations behind them) to what is **in** the omnibus provisional vs what is intentionally **out** / preferred embodiment / separate workstream.

**Spec:** `filing-kit/Wrrapd-Provisional-Specification.pdf`  
**Drawings:** `filing-kit/Wrrapd-Provisional-Drawings-FIGS-1-11.pdf`

**Honest answer up front:**  
The provisional covers the **coordination-layer inventions** and the **motivations** behind counsel’s questions (claim tier, closed loop, active vs passive, dual-checkout, waiting room, two-phase commit, proof-of-craftsmanship). It does **not** replace counsel’s later non-provisional claim craft, IDS of your machine patents, trademark refile, or purchased old patents. Getting “other opinions” before Submit is wise.

---

## Coverage matrix

| # | Attorney question | Why they asked (motivation) | In this provisional? | Where |
|---|-------------------|----------------------------|----------------------|--------|
| **Q1** | AI design → standard image or wrapping map / G-code? | Hardware-coupled claim tier vs software-only | **Yes** — PNG + sidecar + print-ready path **implemented**; wrap-spec object + G-code / machine parameters as **preferred** | Emb. D; preferred wrap specification; Emb. O ticket→machine params; FIG. 4, 8, 11; Claims 6, 16 |
| **Q2** | Sensors vs scraped/catalog dimensions? | Closed-loop strength; ASIN-as-dimension key | **Yes** — tiered: catalog by product ID → AI inference → optional hub sensors | Emb. E; FIG. 8; Claim 11; Summary |
| **Q3** | How does extension “guide” address? Border vs rewrite? | Passive UI (weak) vs **active DOM rewrite** (strong) | **Yes** — active autofill, lock, overlays, multi-address, Limited Agency, conflict guard, trusted-click | Emb. A/B/J; Steps 270, 320–360; Claims 1(d), 4, 5, 10 |
| **Q4** | Summary sidebar/popup? Cart total verify? | Prior-art crowdedness of sidebars; dual-checkout link | **Yes** — **inline** co-rendered summary; fingerprint invalidation; preferred post-pay cart re-verify | Emb. B Step 330; Emb. C; FIG. 5; Claims 2, 3 |
| **Q5** | Multi-vendor hold / waiting room? | Patentable hold + release logistics | **Yes** — delivery preference tokens, deadline default, pay-lock merge, multi-retailer attribution; cross-retailer hub hold as preferred | Emb. F, G; FIG. 6; Claims 7, 8; Summary “cross-retailer hub holds” |
| **Q6** | Pay Wrrapd then cancel retailer? Refund handshake? | Two-phase commit across platforms (novel, often unbuilt) | **Yes as preferred emb.** — Phase 1/2, abandon → refund + cancel job; fingerprint as signal | Emb. I; FIG. 9; Claim 12 |
| **Q7** | Video of wrap auto-triggered? Push to tracking? | Proof-of-craftsmanship vs mere PoD | **Yes as preferred** — multi-stage video audit; implemented photo+GPS tracking described | Emb. H + preferred video; FIG. 7, 10; Claim 9 |
| **Bridge** | Human vs machine fulfillment | Dispatcher patent sitting on top of hardware | **Yes** — generic semi-/fully-autonomous nodes; **no** machine patent numbers | Emb. O; FIG. 1, 11; Claims 16–19 |

---

## Motivations — did we capture the *strategy*, not just the surface Q?

| Motivation | Captured? | How |
|------------|-----------|-----|
| Prefer **detectable** claims (screenshots, packing slips, track pages) | Yes | Detectability section; observable acts throughout |
| Prefer **active** checkout mutation over passive hints | Yes | Autofill, lock, gate, conflict guard, Limited Agency |
| Reserve **hardware** without requiring build | Yes | Preferred: sensors, G-code/map, machine completion signals |
| Avoid claiming only “pretty wrap paper” | Yes | Focus is coordination pipe, not ribbon method |
| Enable later **split** into multiple NPs | Yes | Omnibus emb. A–O; month-12 split note in docs |
| Machine as **node**, not re-patent steel | Yes | Emb. O generic; no ’205/’907 in spec |
| Dual-checkout / payment contingency | Yes | Emb. C + I |
| Proof beyond FedEx-style delivery | Yes | Emb. H + FIG. 10 preferred video |

---

## Gaps / things counsel may still want (not blockers for provisional)

These are **OK to leave for non-provisional / continuations / other IP**, but you should know them:

1. **Formal claim polish** — Claims 1–19 are illustrative; counsel will rewrite for NP.  
2. **IDS** — Cite US 11,891,205 / 12,280,907 (and third-party art) at **non-provisional**, not required in provisional text.  
3. **Cross-retailer “waiting room” entity** — Described as preferred; no formal `OrderGroup` schema name required for provisional enablement.  
4. **Implemented vs preferred honesty** — Spec marks preferred embodiments; do not tell investors “video audit is live software” if it isn’t.  
5. **Trademarks / design patents / trade secrets / buying old patents** — Outside this PDF (correct).  
6. **Best mode of your specific machine kinematics** — Intentionally omitted (generic apparatus); your issued patents cover your steel.  
7. **Attorney’s original “wrapping map tailored to ASIN box dimensions”** — Covered via Emb. E + D wrap-spec + O machine params; not as a false “already shipping G-code” claim.

---

## Verdict for “other opinions”

**Safe to show this package to another attorney / patent agent as a DIY provisional draft.** Ask them specifically:

1. Is enablement of Embodiments A–O adequate for priority?  
2. Any double-patenting risk vs your machine family (should be low if claims stay on orchestration)?  
3. Any public-disclosure issues from the live site/extension that narrow claims?  
4. Micro-entity certification timing?  
5. Anything critical missing before Submit?

**Do not treat my coverage as a substitute for counsel sign-off** if you want maximum comfort.

---

## Ready-to-upload files (generated)

| File | Path |
|------|------|
| Specification PDF | `/home/phill/wrrapd-GCP/docs/patent/filing-kit/Wrrapd-Provisional-Specification.pdf` |
| Drawings PDF (FIGS 1–11) | `/home/phill/wrrapd-GCP/docs/patent/filing-kit/Wrrapd-Provisional-Drawings-FIGS-1-11.pdf` |
| Spec HTML (alt print) | `.../filing-kit/01-SPECIFICATION-FOR-USPTO.html` |
| Drawings HTML (alt print) | `.../figures/DRAWINGS-PRINT.html` |

Copy those two PDFs to your Windows `WRRAPD-PATENT-FILING/01-SPEC-PDF/` and `02-DRAWINGS-PDF/` folders for Patent Center upload.
