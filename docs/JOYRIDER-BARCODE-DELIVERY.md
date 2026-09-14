# JoyRider barcode delivery (INTERNAL)

> Contractor-app and ops documentation. Shopper pages never mention barcodes,
> PO Boxes, or how a JoyRider finds an address.

Last updated: 2026-09-13.

---

## Why

A JoyRider’s last hop can include **several wrapped gifts plus flowers**. The wrap
itself hides packing slips. A barcode on the finished wrap is how the JoyRider knows
**where this package goes** and **whether flowers travel with it**, without opening
the wrap or calling ops.

---

## Label

- One barcode per finished gift (and per flower-only stop when there is no wrap).
- Printed by the WrapStar at seal time from the WrapStar Console (or a Wrrapd-supplied
  pre-printed label tied to the order).
- Encodes a **public order ref** (or a short token that resolves to it). It must **not**
  print the giftee’s full address in human-readable form on the outside if the wrap
  will sit in a shared space; the app reveals the address after scan.
- Human-readable line allowed: Wrrapd order ref only (e.g. `WR-…`).

---

## JoyRider scan (app)

In the JoyRider app, on an active stop:

1. JoyRider taps **Scan gift**.
2. Camera reads the barcode.
3. App shows:
   - recipient first name + street, city, state, ZIP
   - “Flowers go with this gift: **Yes** / **No**”
   - if Yes: flower SKU / “bouquet already combined” / “pick up flowers first”
4. JoyRider confirms the stop, then marks delivered (photo proof as today).

A scan that does not match the current route is rejected with a short “Wrong gift —
check the label” message. No internal routing language.

---

## WrapStar duty

At the end of each wrap the WrapStar:

1. Seals the gift.
2. Prints / affixes the barcode label from the Console.
3. Includes the label in the finished-wrap photo.

Missing label = order not ready for pickup (same as missing photos).

---

## Implementation notes (when built)

- Token: reuse `externalOrderId` or a signed short code on `Order`.
- Scan route: `POST /api/courier/scan` → order + flower flag.
- Do not expose shopper phone on the scan card unless the delivery requires a call.
- Flowers-only deliveries can use a flower-stop barcode generated when the JoyRider
  buys / picks up the bouquet.

Related: `docs/CONTRACTOR-HOURLY-PAY.md`, JoyRider IC §4.
