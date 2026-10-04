import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { markPaidOrders } from "@/lib/pay-reconcile";

export const dynamic = "force-dynamic";

/** Body: { orderNumber, note } — ops dealt with a paid order outside Command Center (refund, test, entered by hand). */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { orderNumber?: string; note?: string };
  const orderNumber = String(body.orderNumber || "").trim();
  const note = String(body.note || "").trim();
  if (!orderNumber || !note) return NextResponse.json({ error: "Order number and note are required" }, { status: 400 });
  const r = await markPaidOrders([orderNumber], "handled", note, session.name || session.userId);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 502 });
}
