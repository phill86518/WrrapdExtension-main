# Wrrapd Legal — Contractor Agreement Suites

Contractor agreement packets for wet-ink or in-document electronic signature / initials. Each packet names **only that role**.

| Suite | Folder | Role |
|-------|--------|------|
| **WrapStar** | [wrapstar-agreements/](./wrapstar-agreements/) | Gift wrapping only (WrapStar App) |
| **JoyRider** | [joyrider-agreements/](./joyrider-agreements/) | Logistics + final-mile delivery (JoyRider App) |
| **WrapRider** | [wraprider-agreements/](./wraprider-agreements/) | Hybrid wrap **and** deliver (WrapRider App) |
| Pay index (ops) | [contractor-compensation-schedule.md](./contractor-compensation-schedule.md) | Points at three role-only schedules |

Each suite has five companion documents (IC/TSA, Arbitration — Duval County, FL, Background, Code of Conduct, Litigation Funding), plus README, REVIEW-MEMO, `branded/` HTML, and downloadable **PDFs**.

Regenerate PDFs after editing any `.md`:

```bash
python3 docs/legal/render_agreement_pdfs.py
```

## Onboarding acceptance (ESIGN)

Applicants accept the full suite in the pros onboarding portal via Uber-style **I Accept** clickwrap (`wordpress/wrrapd-esign-agreements.php` + `wordpress/legal-agreements/`). No company countersignature on the individual packet. Role titles (WrapStar / JoyRider / WrapRider) apply only after Command Center **Activate**.

