# WrapStar Agreement Suite — Legal-Ops Review Memo

**Date:** July 15, 2026 (updated July 18, 2026: WrapStar App terms; branded HTML with logo + Fraunces)  
**Status:** Counsel-ready operational drafts for licensed Florida attorney final review. Not a substitute for legal advice.  
**Sources reviewed:** Sample `.docx` templates (now in `samples/`); in-repo IC draft; WrapStar onboarding/ops; tracking finance & allocation; customer T&Cs.

---

## 1. Executive verdict

The five uploaded templates were **sample stubs**, not production contracts. Production drafts in this folder supersede the samples for BoldSign / onboarding use, pending attorney sign-off.

**Current product/legal posture reflected in the suite:**

| Topic | Production position |
|-------|---------------------|
| WrapStar role | **Gift wrapping only** — delivery/driving is a separate function |
| Technology | Dedicated **WrapStar App** (separate from consumer Wrrapd app); license, credentials, proof upload, notifications |
| Video proof | Unboxing / wrapping / finished gift only — **no** driver receipt or driver handoff video |
| Insurance | **Not required** (unreasonable for typical WrapStar pay) |
| Custody | Reasonable care; liability for negligence / willful misconduct / unauthorized use — not strict liability for all loss |
| Non-circumvention | **6 months** (narrow; Platform-sourced wrap work only) |
| Arbitration seat | **Jacksonville, Duval County, Florida** |
| Brand presentation | Branded HTML in `branded/` — Wrrapd logo header + **Fraunces** |

---

## 2. Entity-name flag (counsel must confirm)

| Source | Name used |
|--------|-----------|
| Sample templates + customer T&Cs / hub labels | **Wrrapd, Inc.** |
| Thin in-repo IC (`docs/wordpress-snippets/wrrapd-wrapstar-ic-agreement.md`) | **Wrrapd, LLC** |

**Drafting default:** **Wrrapd, Inc.** Counsel should confirm the correct contracting entity.

---

## 3. Redundancies (production placement)

| Topic | Production home |
|-------|-----------------|
| Video proof | **TSA §6** (full); Code = short reminder |
| Background checks | **Background Auth** (operative); TSA = short cross-ref |
| Confidentiality | **TSA §12** (comprehensive: customer/gift/wrap data + business/tech; indefinite survival for personal/gift data); Code = conduct reminder |
| Arbitration | **Arbitration Agreement** (full); TSA = pointer |
| Insurance | Explicit **no mandate** in TSA §10 (do not reintroduce in Code/orientation without amending TSA) |

---

## 4. Reasonability pass (July 15 update)

Changes made so terms fit a wrap-only, modest-pay independent contractor:

1. **Removed** $1M CGL / inland marine / auto insurance requirements and COI / additional-insured language.  
2. **Removed** WrapStar self-delivery / full-service / vehicle / GPS / MVR-as-routine screening.  
3. **Removed** video of driver receipt and driver handoff (not operationally feasible).  
4. **Softened** custody from strict bailee-for-all-loss to **reasonable care**, with clear carve-outs for pre-existing damage (timely reported) and post-release loss.  
5. **Softened** indemnity to track negligence / willful misconduct / Section 5 responsibility (not open-ended “any damage arising from performance”).  
6. **Shortened** non-circumvention tail from 12 months to **6 months**.  
7. Left in place (still reasonable): IC status, W-9/1099, authenticity of proof, confidentiality, Jacksonville arbitration, background screening for trust/safety, age 19+.

**Follow-ups outside this folder:** WordPress orientation / apply copy and onboarding “insurance” step still describe COI upload and $1M coverage in places — align those product strings when you wire BoldSign, or WrapStars will see conflicting instructions.

---

## 5. Ops alignment notes

1. Packages → WrapStar approved mailing address / PO / designee; WrapStar stages for separate courier/carrier.  
2. Proof = three stages only (unbox, wrap, finished).  
3. Pay text still defers to Platform Compensation Schedule (avoids locking unimplemented tips/peak).  
4. Separate Delivery Driver / courier agreement remains out of scope for this suite.

---

## 6. Jacksonville / Florida jurisdiction

- Seat / hearing locale: **Jacksonville, Duval County, Florida** (remote hearings permitted)  
- Governing law: **Florida**  
- Court fallback: **Duval County / Jacksonville, Florida**

---

## 7. Production file map

| File | Role |
|------|------|
| `01_WrapStar_Technology_Services_Agreement.md` | Master IC — wrap-only |
| `02_Mutual_Arbitration_Agreement.md` | Binding individual arbitration (Jacksonville, FL) |
| `03_Background_Check_Authorization.md` | Standalone FCRA disclosure + authorization (no routine MVR) |
| `04_WrapStar_Code_of_Conduct.md` | Behavioral guidelines (wrap-only) |
| `05_Third_Party_Litigation_Funding_Disclosure.md` | Funding disclosure + ongoing duty |
| `samples/*.docx` | Original sample templates (archived) |

---

## 8. Recommended counsel checklist before BoldSign go-live

- [ ] Confirm contracting entity (Inc. vs LLC) and registered address  
- [ ] Confirm comfort with **no insurance mandate** + negligence-based custody standard (Company risk retention)  
- [ ] Confirm FCRA CRA vendor name/address for disclosure insert  
- [ ] Confirm AAA vs JAMS as default administrator  
- [ ] Confirm 6-month non-circumvention under FL law  
- [ ] Align WordPress orientation / insurance onboarding step with “no insurance required”  
- [ ] Align BoldSign multi-document envelope order with onboarding UX  
