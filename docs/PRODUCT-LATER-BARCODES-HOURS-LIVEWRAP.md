# Later product: per-item barcodes, hours ledger, live wrap viewer

Internal design. **Not built yet.** Legal and SOP duties already describe the intended behavior.

Related: [JOYRIDER-BARCODE-DELIVERY.md](./JOYRIDER-BARCODE-DELIVERY.md), [CONTRACTOR-HOURLY-PAY.md](./CONTRACTOR-HOURLY-PAY.md), [sop/](./sop/).

---

## 1. Per-item barcodes + completeness scan

**Today:** one QR per order (`DriverLabelPayload` in `tracking-platform/src/lib/driver-label-qr.ts`). WrapStar “Finished wrapping” prints that single code. There is **no** item index and **no** stop checklist.

**Build:**

- Extend `DriverLabelPayload` with `itemIndex` / `itemCount` (and `kind: "wrap" | "flowers"`).
- Generate **N** labels from finished-wrapping: `WR-{orderRef}-{n}` plus `WR-{orderRef}-FL` when flowers travel without a wrap.
- Human-readable on the wrap: order ref only. Address is **not** printed; the driver / WrapRider app reveals it after a valid scan.
- `POST /api/courier/scan` records each scan against the stop.
- Stop checklist in the JoyRider and WrapRider apps: `2/3 gifts + flowers`. Cannot mark en-route until 100%. Wrong-route scan: “Wrong gift — check the label.”
- Flowers card: Yes / No / pick up first / already combined.

## 2. Hours ledger ($30/hr windows)

**Today:** Command Center stores ZIP / person rates (`DEFAULT_*_HOURLY_CENTS = 3000` in `tracking-platform/src/lib/hourly-rates.ts`). There is no automatic time-clock → earnings row.

**Build:**

- Start/end of an **accepted** wrap or delivery window writes an earnings line: `hours × rate − pace shortfall`.
- Hours are the accepted window, not “app open time,” prorated to 15 minutes.
- Pace shortfall applies to **wrapping hours only** (12 gifts/hour).
- Until this ships, ops can still batch from the roster by hand.

Do **not** put “$30/hr” on shopper or apply pages.

## 3. Live wrap viewer

**Today:** apply + TSA require recorded unbox→wrap→finish. Console has start/end video in the wrap-shift flow. There is **no** true livestream ops can watch.

**Build:**

- WebRTC (for example LiveKit) from the wrap app (WrapStar App / WrapRider App wrap mode) to Command Center **Live wraps**.
- Record to the same proof bucket already used for wrap video.
- Wrrapd staff only. No public stream. Camera on the gift, not housemates.
- If the live link drops, the contractor SOP is stop wrapping and restart.

JoyRider stays delivery-photo + scans — no wrap livestream.

---

Florida counsel still reviews the legal clauses. These product items do not change shopper copy.
