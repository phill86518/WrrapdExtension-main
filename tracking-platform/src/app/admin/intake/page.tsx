import Link from "next/link";
import { redirect } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { requireAdminSession } from "@/lib/auth";
import { listAllOrders } from "@/lib/data";
import { toInstantDate } from "@/lib/ny-date";
import { AdminIntakeBoard, type IntakeRow } from "@/components/admin-intake-board";

export const dynamic = "force-dynamic";

const DONE = new Set(["delivered", "cancelled", "refunded"]);

export default async function AdminIntakePage() {
  const session = await requireAdminSession();
  if (!session) redirect("/admin?next=/admin/intake");
  const orders = (await listAllOrders()).filter((o) => !DONE.has(o.status));
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
      wrapDay: formatInTimeZone(toInstantDate(o.scheduledFor), "America/New_York", "EEE MMM d"),
      status: o.status,
      hubReceipt: o.hubReceipt || null,
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
          the wrap day. When unsure, set the box on the hold shelf and mark it Partly received with a note.
        </p>
      </div>
      <AdminIntakeBoard rows={rows} />
    </div>
  );
}
