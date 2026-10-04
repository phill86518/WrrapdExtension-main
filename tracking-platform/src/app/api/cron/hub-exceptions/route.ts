import { NextResponse } from "next/server";
import { getPublicOrigin, sendTransactionalEmail } from "@/lib/customer-notify";
import { etLabel, loadHubExceptions } from "@/lib/hub-exceptions";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * End of day (11:30pm Eastern): emails ops a list of paid orders with no retailer order number
 * (including today's) and extra items still waiting for pickup. Header: x-cron-secret matching CRON_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const sent = request.headers.get("x-cron-secret") || "";
  if (!secret || sent !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { missingRetailerOrder, heldItems } = await loadHubExceptions(true);
  if (!missingRetailerOrder.length && !heldItems.length) {
    return NextResponse.json({ ok: true, missingRetailerOrder: 0, heldItems: 0, emailed: false });
  }
  const origin = getPublicOrigin();
  const link = (id: string, label: string) =>
    `<a href="${origin}/admin/orders/${encodeURIComponent(id)}">${esc(label)}</a>`;
  const missingHtml = missingRetailerOrder
    .map(
      (o) =>
        `<li>${link(o.id, o.externalOrderId || o.id)} · ${esc(o.retailer || "")} · ${esc(o.customerName)} · ${esc(o.customerPhone || o.customerEmail || "")} · placed ${esc(etLabel(o.createdAt))}</li>`,
    )
    .join("");
  const heldHtml = heldItems
    .map(
      ({ order, item, overdue }) =>
        `<li>${link(order.id, order.externalOrderId || order.id)} · ${esc(item.description)} · ${esc(order.customerName)} · ${esc(order.customerPhone || "")} · pickup by ${esc(etLabel(item.pickupBy))}${overdue ? " · <strong>PAST 48 HOURS</strong>" : ""}</li>`,
    )
    .join("");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a;">
${missingRetailerOrder.length ? `<h2 style="font-size:16px;">Paid, but no retailer order number (${missingRetailerOrder.length})</h2>
<p>Check with the shopper. If they did not place the retailer order, refund it from the order page.</p><ul>${missingHtml}</ul>` : ""}
${heldItems.length ? `<h2 style="font-size:16px;">Extra items waiting for pickup (${heldItems.length})</h2><ul>${heldHtml}</ul>` : ""}
<p><a href="${origin}/admin/intake">Open Hub intake</a></p></div>`;
  const to = process.env.NOTIFY_OPS_ADMIN_EMAIL?.split(/[;,]/).map((s) => s.trim()).find((a) => a && a !== "orders@wrrapd.com") || "admin@wrrapd.com";
  const emailed = await sendTransactionalEmail({
    to,
    subject: `Wrrapd hub exceptions: ${missingRetailerOrder.length} without retailer order, ${heldItems.length} extra item(s)`,
    html,
  });
  return NextResponse.json({ ok: true, missingRetailerOrder: missingRetailerOrder.length, heldItems: heldItems.length, emailed });
}
