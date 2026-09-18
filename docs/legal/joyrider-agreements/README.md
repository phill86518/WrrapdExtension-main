# JoyRider Agreement Suite (Production Drafts)

Counsel-ready production text for **JoyRider** (courier / logistics) onboarding.  
**Public name:** JoyRider. Code/URLs may still say `driver` / `/drive/` — do not rename the CPT without migration.  
**Licensed Florida attorney should review before BoldSign go-live.**

**Current scope:** JoyRiders = PO Box/hub inbound → WrapStar drop/pickup → floral hops when assigned → barcode scan → final delivery via the **JoyRider App**. **No wrapping.** Age **21+**. Legally required **auto insurance**. Hourly-by-ZIP pay (see Compensation Schedule). Arbitration seat: **Jacksonville, Florida**.

## Documents

| # | Document | File |
|---|----------|------|
| — | Review memo | [REVIEW-MEMO.md](./REVIEW-MEMO.md) |
| 01 | Independent Contractor Agreement | [01_JoyRider_Independent_Contractor_Agreement.md](./01_JoyRider_Independent_Contractor_Agreement.md) |
| 02 | Mutual Arbitration (Jacksonville, FL) | [02_Mutual_Arbitration_Agreement.md](./02_Mutual_Arbitration_Agreement.md) |
| 03 | Background Check & MVR Authorization | [03_Background_Check_Authorization.md](./03_Background_Check_Authorization.md) |
| 04 | Code of Conduct & Safety Guidelines | [04_JoyRider_Code_of_Conduct.md](./04_JoyRider_Code_of_Conduct.md) |
| 05 | Third-Party Litigation Funding Disclosure | [05_Third_Party_Litigation_Funding_Disclosure.md](./05_Third_Party_Litigation_Funding_Disclosure.md) |
| — | Shared Compensation Schedule | [../contractor-compensation-schedule.md](../contractor-compensation-schedule.md) |
| — | Branded HTML (logo + Fraunces) | [branded/](./branded/) |

WrapStar suite (separate role): [`../wrapstar-agreements/`](../wrapstar-agreements/).

**BoldSign:** `WRRAPD_BOLDSIGN_DRIVER_IC_TEMPLATE_ID` (and companion template IDs when ready). Signer tags use `{{sign|…}}`, `{{date|…}}`, `{{text|…}}`.

Regenerate branded HTML:

```bash
python3 docs/legal/joyrider-agreements/branded/render_branded_html.py
```
