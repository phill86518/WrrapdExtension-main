import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOrderById, patchOrderFields } from "@/lib/data";
import { sendTransactionalEmail } from "@/lib/customer-notify";
import { refundIssuedEmailHtml } from "@/lib/email-templates/transactional";

export const dynamic = "force-dynamic";

const PAY_API = (process.env.WRRAPD_PAY_API_ORIGIN || "https://api.wrrapd.com").replace(/\/$/, "");

/**
 * Admin refund: the pay server issues it through Helcim (or Stripe for legacy orders) and
 * records it on the pay-server order; this route mirrors it onto the Command Center order.
 * Body: { amountCents?: number (omit = full remaining), reason: string, requestId?: string }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = process.env.WRRAPD_PAY_INTERNAL_KEY?.trim();
  if (!key) return NextResponse.json({ error: "Refunds are not set up (WRRAPD_PAY_INTERNAL_KEY)." }, { status: 503 });

  const { id } = await params;
  const order = await getOrderById(id);
  const orderNumber = order?.externalOrderId?.trim();
  if (!order || !orderNumber) return NextResponse.json({ error: "Order has no Wrrapd order number" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    amountCents?: number;
    reason?: string;
    requestId?: string;
  };
  const reason = String(body.reason || "").trim();
  if (!reason) return NextResponse.json({ error: "Enter a reason" }, { status: 400 });
  const requestId = String(body.requestId || "").trim() || randomUUID();

  const res = await fetch(`${PAY_API}/api/internal/refund-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Wrrapd-Internal-Key": key },
    body: JSON.stringify({
      orderNumber,
      amountCents: body.amountCents == null ? undefined : Math.round(Number(body.amountCents)),
      reason,
      requestedBy: session.userId,
      requestId,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    refundId?: string;
    kind?: string;
    amountCents?: number;
    refundedCents?: number;
    paidCents?: number;
  };
  if (!res.ok || !data.ok || !data.refundId) {
    return NextResponse.json({ error: data.error || "Refund failed" }, { status: res.status >= 400 ? res.status : 502 });
  }

  const at = new Date().toISOString();
  const refunds = [...(order.refunds || [])];
  if (!refunds.some((r) => r.id === data.refundId)) {
    refunds.push({
      id: data.refundId,
      amountCents: data.amountCents || 0,
      kind: data.kind || "refund",
      reason: reason.slice(0, 300),
      by: session.userId,
      at,
    });
  }
  const fullyRefunded = (data.refundedCents || 0) >= (data.paidCents || Infinity);
  const updated = await patchOrderFields(
    id,
    {
      refunds,
      refundedCents: data.refundedCents,
      ...(fullyRefunded ? { status: "refunded" as const } : {}),
    },
    session.userId,
  );

  if (order.customerEmail?.trim()) {
    await sendTransactionalEmail({
      to: order.customerEmail.trim(),
      subject: `Your Wrrapd refund for order ${orderNumber}`,
      html: refundIssuedEmailHtml({
        customerName: order.customerName,
        customerGreetingName: order.customerGreetingName,
        orderRef: orderNumber,
        amountCents: data.amountCents || 0,
      }),
    }).catch((e) => console.error("[refund] customer email failed", id, e));
  }

  return NextResponse.json({ ok: true, order: updated, refund: data });
}
