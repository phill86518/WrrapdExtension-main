# WrapStar Agreement Suite (Production Drafts)

Counsel-ready production text for WrapStar onboarding Agreements. **Licensed Florida attorney should review before BoldSign go-live.**

**Current scope:** WrapStars = **gift wrapping only** via the **WrapStar App** (separate from the consumer Wrrapd app). Delivery is separate. **No commercial insurance mandate.** Proof = unboxing, wrapping, finished gift (no driver receipt/handoff video).

## Branded documents (logo + Fraunces)

Open the HTML files in [`branded/`](./branded/) for the signed/reviewable look: Wrrapd logo header, Fraunces type, print-ready. Regenerate after editing any `.md`:

```bash
python3 docs/legal/wrapstar-agreements/branded/render_branded_html.py
```

| Document | Markdown (source) | Branded HTML |
|----------|-------------------|--------------|
| Review memo | [REVIEW-MEMO.md](./REVIEW-MEMO.md) | — |
| 01 Technology Services Agreement | [01_….md](./01_WrapStar_Technology_Services_Agreement.md) | [branded/01_….html](./branded/01_WrapStar_Technology_Services_Agreement.html) |
| 02 Mutual Arbitration | [02_….md](./02_Mutual_Arbitration_Agreement.md) | [branded/02_….html](./branded/02_Mutual_Arbitration_Agreement.html) |
| 03 Background Check | [03_….md](./03_Background_Check_Authorization.md) | [branded/03_….html](./branded/03_Background_Check_Authorization.html) |
| 04 Code of Conduct | [04_….md](./04_WrapStar_Code_of_Conduct.md) | [branded/04_….html](./branded/04_WrapStar_Code_of_Conduct.html) |
| 05 Litigation Funding | [05_….md](./05_Third_Party_Litigation_Funding_Disclosure.md) | [branded/05_….html](./branded/05_Third_Party_Litigation_Funding_Disclosure.html) |
| Original sample `.docx` | [samples/](./samples/) | — |

**Contracting entity in these drafts:** Wrrapd, Inc. (confirm vs LLC — see REVIEW-MEMO).

**BoldSign:** Signer tags use `{{sign|…}}`, `{{date|…}}`, and `{{text|…}}` in the `.md` sources. For BoldSign PDF templates, export from the branded HTML (Print → PDF) or paste styled content so the logo header and Fraunces carry through.
