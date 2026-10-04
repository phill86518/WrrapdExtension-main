import { NextRequest, NextResponse } from "next/server";
import { addRetailerOrderNumber, listOrdersByExternalId, normalizeRetailerOrderNumber } from "@/lib/retailer-order-ref";

export const dynamic = "force-dynamic";

/**
 * Pay server → Command Center: retailer order number captured on the retailer's confirmation page.
 * Auth: Authorization: Bearer <INGEST_API_KEY>. Body: { externalOrderId, retailerOrderNumber, source? }
 */
export async function POST(request: NextRequest) {
  const expected = process.env.INGEST_API_KEY?.trim();
  const auth = request.headers.get("authorization") || "";
  const key = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!expected || key !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const externalOrderId = String(body.externalOrderId || "").trim();
  const num = normalizeRetailerOrderNumber(body.retailerOrderNumber);
  if (!externalOrderId || !num) return NextResponse.json({ error: "Invalid order number" }, { status: 400 });

  const orders = await listOrdersByExternalId(externalOrderId);
  if (orders.length === 0) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const source = String(body.source || "extension").slice(0, 40);
  for (const o of orders) await addRetailerOrderNumber(o, num, `retailer-ref:${source}`);
  return NextResponse.json({ ok: true, updated: orders.length });
}
