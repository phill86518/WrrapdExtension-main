import { NextResponse } from "next/server";
import { getOrderByTrackingToken } from "@/lib/data";
import { addRetailerOrderNumber, normalizeRetailerOrderNumber } from "@/lib/retailer-order-ref";

export const dynamic = "force-dynamic";

/** Shopper adds the retailer's order number from the tracking page (token = same secret as /track/[token]). */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const order = token?.trim() ? await getOrderByTrackingToken(token.trim()) : undefined;
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (order.hubReceipt?.status === "received" || ["delivered", "cancelled", "refunded"].includes(order.status)) {
    return NextResponse.json({ ok: true, retailerOrderNumbers: order.retailerOrderNumbers || [] });
  }
  const body = (await request.json().catch(() => ({}))) as { retailerOrderNumber?: string };
  const num = normalizeRetailerOrderNumber(body.retailerOrderNumber);
  if (!num) return NextResponse.json({ error: "Please check the order number and try again." }, { status: 400 });
  const next = await addRetailerOrderNumber(order, num, "shopper:track-page");
  return NextResponse.json({ ok: true, retailerOrderNumbers: next?.retailerOrderNumbers || [] });
}
