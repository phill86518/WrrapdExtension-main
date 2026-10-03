import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { InventoryCalendar } from "@/components/inventory-calendar";
import { listAllOrders } from "@/lib/data";
import { inventoryNeedsFromOrders, inventoryPeopleFromRosters } from "@/lib/inventory";
import { formatDateKeyNy } from "@/lib/ny-date";
import { listRegisteredWrapstars } from "@/lib/wrapstar-registry";
import { listWrapriders } from "@/lib/wraprider-registry";

export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();

  const [orders, wrapstars, wrapriders] = await Promise.all([
    listAllOrders(),
    listRegisteredWrapstars(),
    listWrapriders(),
  ]);
  const people = inventoryPeopleFromRosters(wrapstars, wrapriders);
  const needs = inventoryNeedsFromOrders(orders, people);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold text-slate-900">Daily inventory</h1>
      <p className="mt-1 text-sm text-slate-600">
        Paper, cardboard boxes, and tissue for gifts still to wrap. Boxed items are left off the box list.
        Clothes use a shirt box and one sheet of tissue.
      </p>
      <div className="mt-6">
        <InventoryCalendar needs={needs} todayKey={formatDateKeyNy(new Date())} />
      </div>
    </div>
  );
}
