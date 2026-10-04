import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { resendPaidOrder } from "@/lib/pay-reconcile";

export const dynamic = "force-dynamic";

/** Body: { orderNumber } — asks the pay server to send a paid order to Command Center again. */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { orderNumber?: string };
  const orderNumber = String(body.orderNumber || "").trim();
  if (!orderNumber) return NextResponse.json({ error: "orderNumber required" }, { status: 400 });
  const r = await resendPaidOrder(orderNumber);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 502 });
}
