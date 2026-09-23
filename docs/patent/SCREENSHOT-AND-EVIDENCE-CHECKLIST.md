# Screenshot & Evidence Checklist

Two different screenshot jobs. Do not mix them up.

---

## A. USPTO FILING SCREENSHOTS (save forever)

Folder: `WRRAPD-PATENT-FILING/05-SCREENSHOTS-OF-FILING/`

| # | When | Filename | What must be visible |
|---|------|----------|----------------------|
| 1 | After choosing ADS method | `01-chose-web-ads.png` | “Web ADS” selected |
| 2 | After Web ADS filled | `02-web-ads-complete.png` | Title + your inventor name |
| 3 | After uploads | `03-documents-uploaded.png` | Spec + Drawings listed |
| 4 | Fee screen | `04-fee-screen.png` | Fee amount + entity status |
| 5 | After Submit | `05-submission-confirmation.png` | Success + app number if shown |
| 6 | Filing receipt | download PDF instead | Application number + filing date |

How to capture (Windows): **Win+Shift+S** → Rectangular snip → paste into Paint → Save as PNG.

---

## B. PRIVATE PRODUCT EVIDENCE (optional — NEVER upload to USPTO)

Folder: `WRRAPD-PATENT-FILING/06-PRIVATE-EVIDENCE/`

These prove dates and conception for diligence / inventorship — **not** formal patent drawings.

| Shot | Filename pattern | How to get it |
|------|------------------|---------------|
| Cart opt-in on a retailer | `YYYY-MM-DD_cart-optin.png` | Open Target/Walmart cart with extension on |
| Gift modal | `YYYY-MM-DD_gift-modal.png` | Open wrap choices |
| Pay panel | `YYYY-MM-DD_pay-panel.png` | Checkout with Pay Wrrapd visible |
| Hub address filled | `YYYY-MM-DD_hub-filled.png` | After pay, shipping shows hub (blur personal data) |
| AI designs | `YYYY-MM-DD_ai-designs.png` | AI design picker |
| Tracking page | `YYYY-MM-DD_track.png` | `/track/...` demo or real (blur PII) |
| WrapStar proof | `YYYY-MM-DD_proof.png` | Proof upload UI or completed proof (blur faces/addresses) |

**Blur rules:** Giftee names, full street addresses, phone numbers, emails, card digits.

---

## C. WHAT NOT TO SCREENSHOT INTO THE PATENT

- Amazon/Target chrome with logos as “FIG. 1”  
- Cursor IDE  
- Stripe dashboard secrets  
- `.env` / API keys  
- Customer PII  

Use `docs/patent/figures/DRAWINGS-PRINT.html` for official FIGS.

---

## D. After filing — one index file

Create `05-SCREENSHOTS-OF-FILING/INDEX.txt`:

```
App No:
Filing Date:
Spec PDF sha256: (optional)
Drawings PDF sha256: (optional)
Filed by:
```

Optional hash (Git Bash / PowerShell):

```powershell
Get-FileHash .\01-SPEC-PDF\Wrrapd-Provisional-Specification.pdf
Get-FileHash .\02-DRAWINGS-PDF\Wrrapd-Provisional-Drawings-FIGS-1-10.pdf
```
