import Link from "next/link";
import { redirect } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { requireAdminSession } from "@/lib/auth";
import { listAllOrders } from "@/lib/data";
import { toInstantDate } from "@/lib/ny-date";
import { AdminIntakeBoard, type IntakeRow } from "@/components/admin-intake-board";
import { etLabel, isMissingRetailerOrder, openHeldItems } from "@/lib/hub-exceptions";

export const dynamic = "force-dynamic";

const DONE = new Set(["delivered", "cancelled", "refunded"]);

export default async function AdminIntakePage() {
  const session = await requireAdminSession();
  if (!session) redirect("/admin?next=/admin/intake");
  const all = await listAllOrders();
  const orders = all.filter((o) => !DONE.has(o.status));
  const now = new Date();
  const missingRef = orders.filter((o) => isMissingRetailerOrder(o, false, now));
  const held = openHeldItems(all, now);
  const rows: IntakeRow[] = orders
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
    .map((o) => ({
      id: o.id,
      externalOrderId: o.externalOrderId || null,
      retailer: o.retailer || null,
      retailerOrderNumbers: o.retailerOrderNumbers || [],
      customerName: o.customerName,
      recipientName: o.recipientName,
      customerEmail: o.customerEmail || null,
      items: (o.lineItems || []).map((li) => li.title || "").filter(Boolean),
      images: (o.lineItems || []).map((li) => li.imageUrl || "").filter(Boolean).slice(0, 4),
      wrapDay: formatInTimeZone(toInstantDate(o.scheduledFor), "America/New_York", "EEE MMM d"),
      status: o.status,
      hubReceipt: o.hubReceipt || null,
      heldItems: o.heldItems || [],
      missingRetailerOrder: isMissingRetailerOrder(o, false, now),
    }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-blue-800 underline">
          ← Command Center
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-[#0f172a]">Hub intake</h1>
        <p className="mt-1 text-sm text-slate-600">
          Type the order number from the packing slip. If there is no slip, search by item or shopper name and check
          the wrap day. When unsure, set the package on the hold shelf and mark it Partly received with a note.
        </p>
      </div>
      {missingRef.length ? (
        <section className="rounded-xl border-2 border-rose-300 bg-rose-50 p-4">
          <h2 className="font-bold text-rose-900">Paid, but no retailer order yet ({missingRef.length})</h2>
          <p className="mt-1 text-sm text-rose-900">
            Placed before today with no retailer order number and no package. Call or email the shopper; if they did not
            place the retailer order, refund it from the order page.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {missingRef.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="font-semibold text-blue-800 underline">
                  {o.externalOrderId}
                </Link>{" "}
                · {o.retailer || "retailer ?"} · {o.customerName} · {o.customerPhone || o.customerEmail || ""} · placed{" "}
                {etLabel(o.createdAt)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {held.length ? (
        <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <h2 className="font-bold text-amber-950">Extra items waiting for pickup ({held.length})</h2>
          <p className="mt-1 text-sm text-amber-950">
            Not for wrapping. The shopper was asked to call Customer Service within 48 hours to arrange pickup.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {held.map(({ order, item, overdue }) => (
              <li key={item.id} className={overdue ? "font-semibold text-rose-800" : ""}>
                <Link href={`/admin/orders/${encodeURIComponent(order.id)}`} className="text-blue-800 underline">
                  {order.externalOrderId || order.id}
                </Link>{" "}
                · {item.description} · {order.customerName} · {order.customerPhone || ""} · pickup by {etLabel(item.pickupBy)}
                {overdue ? " · PAST 48 HOURS" : ""}
                {item.customerNotifiedAt ? "" : " · shopper NOT notified, call them"}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <AdminIntakeBoard rows={rows} />
    </div>
  );
}
