import { NextResponse } from "next/server";
import { getOrderByTrackingToken } from "@/lib/data";
import { orderRecipientForDisplay } from "@/lib/order-display";
import { buildDemoSeedOrders, DEMO_CUSTOMER_TRACKING_TOKEN } from "@/lib/demo-orders";

export const dynamic = "force-dynamic";

/**
 * Public read by tracking token (same secret as the /track/[token] URL).
 * Used for soft polling so the customer map does not require full page reloads.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  let order = await getOrderByTrackingToken(token.trim());
  if (!order && token.trim() === DEMO_CUSTOMER_TRACKING_TOKEN) {
    order = buildDemoSeedOrders().find((o) => o.trackingToken === token.trim());
  }
  if (!order) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const d = orderRecipientForDisplay(order);
  return NextResponse.json({
    status: order.status,
    etaMinutes: order.etaMinutes ?? null,
    driverName: order.driverName ?? null,
    latestLocation: order.latestLocation ?? null,
    addressLine1: d.addressLine1,
    city: d.city,
    state: d.state,
    postalCode: d.postalCode,
    proofPhotoUrl: order.proofPhotoUrl ?? null,
  });
}
