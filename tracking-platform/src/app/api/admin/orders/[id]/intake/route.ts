import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendTransactionalEmail, sendTransactionalSms, toUsE164 } from "@/lib/customer-notify";
import { getOrderById, patchOrderFields } from "@/lib/data";
import { heldItemPickupEmailHtml } from "@/lib/email-templates/transactional";
import {
  CUSTOMER_SERVICE_PHONE_E164,
  CUSTOMER_SERVICE_PHONE_LABEL,
  HELD_ITEM_PICKUP_HOURS,
  etLabel,
} from "@/lib/hub-exceptions";
import { addRetailerOrderNumber, normalizeRetailerOrderNumber } from "@/lib/retailer-order-ref";
import type { HeldItem, HubReceipt, Order } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: HubReceipt["status"][] = ["received", "partial", "damaged", "missing"];

/**
 * Hub intake. Body: { action: "receive", status, note? } | { action: "clear" } | { action: "add-ref", retailerOrderNumber }
 *   | { action: "hold-item", description } | { action: "resolve-item", itemId, status: "picked_up" | "closed", note? }
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

  if (body.action === "hold-item") {
    const description = String(body.description || "").trim().slice(0, 200);
    if (!description) return NextResponse.json({ error: "Describe the item (for example: 2-pack phone cases)." }, { status: 400 });
    const receivedAt = new Date().toISOString();
    const item: HeldItem = {
      id: randomUUID(),
      description,
      receivedAt,
      by,
      pickupBy: new Date(Date.parse(receivedAt) + HELD_ITEM_PICKUP_HOURS * 3600_000).toISOString(),
      status: "held",
    };
    const notified = await notifyHeldItem(order, item);
    if (notified) item.customerNotifiedAt = new Date().toISOString();
    const next = await patchOrderFields(id, { heldItems: [...(order.heldItems || []), item] }, `admin:${by}`);
    return NextResponse.json({ ok: true, order: next, customerNotified: notified });
  }

  if (body.action === "resolve-item") {
    const status = String(body.status || "");
    if (status !== "picked_up" && status !== "closed") return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    const note = String(body.note || "").trim().slice(0, 300);
    if (status === "closed" && !note) {
      return NextResponse.json({ error: "Add a note on what happened to the item." }, { status: 400 });
    }
    const items = order.heldItems || [];
    if (!items.some((it) => it.id === body.itemId)) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    const resolvedAt = new Date().toISOString();
    const heldItems = items.map((it) =>
      it.id === body.itemId ? { ...it, status: status as HeldItem["status"], resolvedAt, resolvedBy: by, ...(note ? { note } : {}) } : it,
    );
    const next = await patchOrderFields(id, { heldItems }, `admin:${by}`);
    return NextResponse.json({ ok: true, order: next });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

async function notifyHeldItem(order: Order, item: HeldItem): Promise<boolean> {
  const orderRef = order.externalOrderId?.trim() || order.id;
  const pickupByLabel = etLabel(item.pickupBy);
  let sent = false;
  if (order.customerEmail?.trim()) {
    sent = await sendTransactionalEmail({
      to: order.customerEmail.trim(),
      subject: `Wrrapd: an item from order ${orderRef} is ready for pickup`,
      html: heldItemPickupEmailHtml({
        customerName: order.customerName,
        customerGreetingName: order.customerGreetingName,
        orderRef,
        description: item.description,
        pickupByLabel,
        phoneLabel: CUSTOMER_SERVICE_PHONE_LABEL,
        phoneE164: CUSTOMER_SERVICE_PHONE_E164,
      }),
    }).catch(() => false);
  }
  const phone = order.customerPhone ? toUsE164(order.customerPhone) : null;
  if (phone) {
    const sms = await sendTransactionalSms({
      toE164: phone,
      body: `Wrrapd: we received an item with order ${orderRef} that is not part of your gift-wrapping (${item.description}). Please call ${CUSTOMER_SERVICE_PHONE_LABEL} by ${pickupByLabel} to arrange pickup.`,
    }).catch(() => false);
    sent = sent || sms;
  }
  return sent;
}
