# Contractor pay — hourly by ZIP (INTERNAL)

> **Confidential. Never publish on `wrrapd.com`, `apply.wrrapd.com`, `pros.wrrapd.com`,
> shopper emails, or any applicant-facing string.** Public pages must not mention hourly
> rates, per-order pay, pace, penalties, ZIP pricing, or how a contractor is paid.
> See `docs/WRAPSTARS-OPERATIONS-MODEL.md` §2.

Last updated: 2026-09-13.

---

## Decision

WrapStars and JoyRiders are **not** paid per order. Both roles are paid an **hourly rate**.
The hourly rate is chosen from the contractor’s **home / work ZIP** (same idea as the
service-area ZIP allowlist in Command Center → Allowed ZIP codes).

A later product change back to per-order (or a mix) is allowed; this document is the
current rule. The Independent Contractor agreements defer to the **Compensation Schedule**
published in Command Center / the contractor apps so a future change can be made
prospectively without rewriting the whole contract.

---

## Rate lookup (both roles)

Resolution order for a given 5-digit US ZIP:

1. Exact ZIP override in Command Center (`/admin/finance/rates`)
2. 3-digit ZIP prefix override (covers a metro slice, e.g. `322` for Jacksonville)
3. Role default (WrapStar, JoyRider, or WrapRider default — three separate pay structures)

All amounts are stored in **cents**. Command Center edits them as dollars.

Starter defaults (edit before first live shift — these are placeholders, not a promise):

| Role | Default hourly |
|---|---|
| WrapStar | $30.00 |
| JoyRider | $30.00 |
| WrapRider | $30.00 (own rate — not derived from the other two) |

Person-specific override: when Command Center **Approve onboarding** runs, admin sets (or
keeps) an hourly rate for that hire. That value is stored on the roster row and **wins** over
ZIP table and role default. Public / apply pages must never show dollar amounts.

Home ZIP on the application / roster row is the ZIP used unless ops sets a different
work ZIP on the contractor record.

---

## WrapStars

### What they buy

WrapStars purchase and keep their own **ordinary wrapping materials**. Wrrapd does not
stock a WrapStar’s studio. Minimum kit:

- gift-wrapping paper
- small boxes when an item needs a box
- scissors
- cutters
- tape

Ribbon, tissue, and tags follow the order card; if an order specifies a material Wrrapd
will supply, that is called out on the order. Otherwise the WrapStar supplies it.

### Pace (very important)

Expected pace: **12 finished gifts per hour**.

If a WrapStar finishes fewer than 12 gifts in a paid hour, pay for that hour is reduced
by:

```
shortfall × (hourly_rate ÷ 12)
```

`shortfall` = `12 − gifts_finished_in_that_hour` (never below 0).

**Example.** Rate $24.00/hour. WrapStar finishes 9 gifts in the hour.

- Unit value = 24 / 12 = $2.00
- Shortfall = 3
- Reduction = $6.00
- Hour pay = $18.00

A gift counts as finished only when it is wrapped to standard, documented (photo/video),
sealed/labeled, and ready for JoyRider pickup. Damaged / flagged items that should not
be wrapped do not count as unfinished.

Wrrapd may waive a reduction for a window (materials delay, missing inbound package,
documented exception). Waiver is an ops decision, not a public promise.

### How hours are counted

Hours are the **offered / accepted wrap windows** on the roster (the same windows the
JoyRider uses for drop-off and pickup), not “time the app was open.” Partial windows
are prorated to the nearest 15 minutes. The ledger implementation (time clock →
earnings row) follows this doc; until that ledger ships, Command Center still holds
the rates and ops can compute a batch by hand.

---

## JoyRiders

JoyRiders are also **hourly**, same ZIP lookup, **no** 12-gifts pace rule (that is
WrapStar-only). JoyRider hours are the accepted delivery / logistics windows.

### What a JoyRider does in a window

1. **Pick up inbound items** from a nearby Wrrapd location (typically a PO Box or hub).
2. **Drop those items to the assigned WrapStar(s)** in the agreed handoff window.
3. **Pick up flowers** when an order needs them, and **pick up finished wrapped gifts**
   from the WrapStar(s).
4. **Deliver** gifts and/or flowers to the giftee.

### Barcode on every wrapped gift

Every finished wrap gets a **Wrrapd barcode** (label from the WrapStar Console / printer
or a Wrrapd-supplied label). The JoyRider **scans the barcode** in the JoyRider app
before final delivery. The scan shows:

- final delivery address
- whether **flowers go with this gift** (yes / no / already combined)

See `docs/JOYRIDER-BARCODE-DELIVERY.md`.

JoyRiders do not wrap. They are the only role that meets the end customer.

---

## What the public may see

**Nothing about this.** No hourly, no per-order, no “12 per hour,” no ZIP rates, no
“see the payout before you accept,” no “earn for every completed wrap.”

Allowed public lines (craft / logistics only): wrap from home, packages brought to you,
apply in minutes, independent contractor. Pay questions are answered only after approval,
inside onboarding / the contractor app.

---

## Where this lives in code

| Piece | Location |
|---|---|
| This policy | `docs/CONTRACTOR-HOURLY-PAY.md` |
| Public-copy rules | `docs/WRAPSTARS-OPERATIONS-MODEL.md` |
| WrapStar TSA §8 | `docs/legal/wrapstar-agreements/01_WrapStar_Technology_Services_Agreement.md` |
| JoyRider IC | `docs/legal/joyrider-agreements/01_JoyRider_Independent_Contractor_Agreement.md` |
| Compensation Schedule (legal summary) | `docs/legal/contractor-compensation-schedule.md` |
| Barcode workflow | `docs/JOYRIDER-BARCODE-DELIVERY.md` |
| Command Center rates | `tracking-platform/src/app/admin/finance/rates/page.tsx` + `src/lib/hourly-rates.ts` |
| Stored config | Firestore `tracking_payout_config/default` (hourly fields) |

---

## Command Center

**Finance → Hourly rates** (`/admin/finance/rates`):

- WrapStar default $/hour
- JoyRider default $/hour
- Pace (fixed at 12 unless a founder later changes the constant)
- ZIP / prefix table: `32218 → WrapStar $26 / JoyRider $23`

Do **not** put platform-take percents or “base pay per delivered order” back on this
screen. Those are retired.
