# Refunds — standard operating procedure

Applies to every Wrrapd charge (Pay Wrrapd). Wrrapd only refunds its own fees (wrap, design, box, flowers, tax). Retailer purchases (Amazon, Target, …) are refunded by the retailer.

## When to refund

| Situation | Refund |
|---|---|
| Gift never wrapped / order cancelled before wrapping | Full |
| Gift arrived damaged because of Wrrapd handling | Full, then file the damage report |
| Late beyond the promised day (Wrrapd's fault) | Partial or full — owner decides |
| Retailer never delivered the item to the hub | Full Wrrapd fees once the retailer confirms |
| Flowers unavailable after payment | Flowers line only |
| Shopper changed their mind after delivery | No refund (offer a credit only if the owner approves) |

Chargebacks are handled separately: answer in Helcim with the evidence packet (wrap video, delivery photo + GPS, timestamps from Command Center).

## How to refund (normal path)

1. Command Center → **Orders** → open the order.
2. **Refund** section → amount (leave empty for the full remaining amount) → reason → **Issue refund** → confirm.
3. The pay server refunds through Helcim (or Stripe for older orders), records it on the order, and the shopper gets a short refund email. A full refund sets the order to **refunded**.
4. The refund is listed in the same section with amount, time, reason and who issued it.

Retrying after an error is safe: the same click reuses one request id, so it cannot refund twice.

## Same-day charges

Helcim can only refund a settled batch. A full refund on a charge from today is sent as a **reversal** automatically. A *partial* refund on a same-day charge fails with a settlement message — wait until the batch settles (next day) and refund again.

## Refunds made in the Helcim dashboard

Allowed, but always add the Wrrapd order number as the invoice number. With the Helcim webhook set up (see below), dashboard refunds are recorded on the order automatically. Without it, issue refunds from Command Center only.

## One-time setup (owner)

- Helcim → **All Tools → Integrations → Webhooks**: URL `https://api.wrrapd.com/api/payment-events`, event **Card transactions**. Copy the **verifier token** into the VM `.env` as `HELCIM_WEBHOOK_VERIFIER_TOKEN=…`, then `pm2 restart wrrapd-server`.
- Before launch: one real $1 test charge and refund (master readiness doc, Exhibit A).
