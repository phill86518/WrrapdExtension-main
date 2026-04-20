import type { Order } from "./types";

/**
 * Pay-server ingest attaches `ingestDeliverTo` (immutable snapshot of the resolved giftee row).
 * Prefer it for UI + notifications so Command Center / Driver match thank-you / ops emails even when
 * legacy `recipientName` / address fields were overwritten by a later merge.
 */
export function orderRecipientForDisplay(order: Order): {
  recipientName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
} {
  const d = order.ingestDeliverTo;
  if (d?.recipientName?.trim() && d.addressLine1?.trim()) {
    return {
      recipientName: d.recipientName.trim(),
      addressLine1: d.addressLine1.trim(),
      addressLine2: d.addressLine2?.trim() || undefined,
      city: d.city.trim(),
      state: d.state.trim(),
      postalCode: d.postalCode.trim(),
    };
  }
  return {
    recipientName: order.recipientName,
    addressLine1: order.addressLine1,
    addressLine2: order.addressLine2,
    city: order.city,
    state: order.state,
    postalCode: order.postalCode,
  };
}
