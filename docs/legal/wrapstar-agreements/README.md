# WrapStar Agreement Suite (Production Drafts)

Counsel-ready production text for WrapStar onboarding Agreements. **Licensed Florida attorney should review before BoldSign go-live.**

**Current scope (Sep 2026):** WrapStars = **gift wrapping only** via the **WrapStar App**. Packages are **brought by JoyRiders** and **collected when done** (no WrapStar PO Box pickup, no driving, no giftee contact). Affix **delivery barcode**. Proof = unboxing → wrap → finished gift (no JoyRider handoff video). **Hourly-by-ZIP** pay with **12 gifts/hour** pace (Compensation Schedule). **No commercial insurance mandate** in this legal suite. **No tips** unless Schedule later changes. Arbitration: **Jacksonville, Florida**.

## Branded documents (logo + Fraunces)

Open [`branded/`](./branded/). Regenerate after editing any `.md`:

```bash
python3 docs/legal/wrapstar-agreements/branded/render_branded_html.py
```

| Document | Markdown | Branded HTML |
|----------|----------|--------------|
| Review memo | [REVIEW-MEMO.md](./REVIEW-MEMO.md) | — |
| 01 Technology Services Agreement | [01_….md](./01_WrapStar_Technology_Services_Agreement.md) | [branded/01_….html](./branded/01_WrapStar_Technology_Services_Agreement.html) |
| 02 Mutual Arbitration | [02_….md](./02_Mutual_Arbitration_Agreement.md) | [branded/02_….html](./branded/02_Mutual_Arbitration_Agreement.html) |
| 03 Background Check | [03_….md](./03_Background_Check_Authorization.md) | [branded/03_….html](./branded/03_Background_Check_Authorization.html) |
| 04 Code of Conduct | [04_….md](./04_WrapStar_Code_of_Conduct.md) | [branded/04_….html](./branded/04_WrapStar_Code_of_Conduct.html) |
| 05 Litigation Funding | [05_….md](./05_Third_Party_Litigation_Funding_Disclosure.md) | [branded/05_….html](./branded/05_Third_Party_Litigation_Funding_Disclosure.html) |
| Shared Compensation Schedule | [../contractor-compensation-schedule.md](../contractor-compensation-schedule.md) | — |
| Original sample `.docx` | [samples/](./samples/) | — |

JoyRider suite (separate role): [`../joyrider-agreements/`](../joyrider-agreements/).

**Contracting entity:** Wrrapd, Inc. (confirm vs LLC).

**Note:** WordPress WrapStar onboarding may still show an insurance COI step — product should be aligned with TSA §10 (no commercial insurance mandate) or counsel should restore a mandate.
