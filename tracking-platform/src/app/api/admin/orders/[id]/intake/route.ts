import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOrderById, patchOrderFields } from "@/lib/data";
import { addRetailerOrderNumber, normalizeRetailerOrderNumber } from "@/lib/retailer-order-ref";
import type { HubReceipt } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: HubReceipt["status"][] = ["received", "partial", "damaged", "missing"];

/**
 * Hub intake. Body: { action: "receive", status, note? } | { action: "clear" } | { action: "add-ref", retailerOrderNumber }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const by = session.name || session.userId;

  if (body.action === "add-ref") {
    const num = normalizeRetailerOrderNumber(body.retailerOrderNumber);
    if (!num) return NextResponse.json({ error: "Enter the retailer order number (letters, digits, dashes)." }, { status: 400 });
    const next = await addRetailerOrderNumber(order, num, `admin:${by}`);
    return NextResponse.json({ ok: true, order: next });
  }

  if (body.action === "clear") {
    const next = await patchOrderFields(id, { hubReceipt: undefined }, `admin:${by}`);
    return NextResponse.json({ ok: true, order: next });
  }

  if (body.action === "receive") {
    const status = String(body.status || "") as HubReceipt["status"];
    if (!STATUSES.includes(status)) return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    const note = String(body.note || "").trim().slice(0, 500);
    if ((status === "damaged" || status === "partial") && !note) {
      return NextResponse.json({ error: "Add a short note about what is damaged or missing." }, { status: 400 });
    }
    const hubReceipt: HubReceipt = { status, at: new Date().toISOString(), by, ...(note ? { note } : {}) };
    const next = await patchOrderFields(id, { hubReceipt }, `admin:${by}`);
    return NextResponse.json({ ok: true, order: next });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
