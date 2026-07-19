import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listAllOrders } from "@/lib/data";
import { formatDateKeyNy } from "@/lib/ny-date";
import { orderWrapstarId } from "@/lib/types";

export const dynamic = "force-dynamic";

type Row = {
  date: string;
  total: number;
  delivered: number;
  inProgress: number;
  wrapComplete: number;
  uniqueWrapstars: number;
  uniqueCouriers: number;
};

function summarize(rows: Awaited<ReturnType<typeof listAllOrders>>): Row[] {
  const map = new Map<
    string,
    Row & { wrapstarSet: Set<string>; courierSet: Set<string> }
  >();
  for (const o of rows) {
    const date = formatDateKeyNy(o.scheduledFor);
    const cur = map.get(date) ?? {
      date,
      total: 0,
      delivered: 0,
      inProgress: 0,
      wrapComplete: 0,
      uniqueWrapstars: 0,
      uniqueCouriers: 0,
      wrapstarSet: new Set<string>(),
      courierSet: new Set<string>(),
    };
    cur.total += 1;
    if (o.status === "delivered") cur.delivered += 1;
    if (
      o.status === "assigned" ||
      o.status === "en_route" ||
      o.status === "in_progress" ||
      o.status === "accepted"
    ) {
      cur.inProgress += 1;
    }
    if (o.wrapPhase === "complete") cur.wrapComplete += 1;
    const ws = orderWrapstarId(o);
    if (ws) cur.wrapstarSet.add(ws);
    if (o.courierDriverId) cur.courierSet.add(o.courierDriverId);
    map.set(date, cur);
  }
  return [...map.values()]
    .map((r) => ({
      date: r.date,
      total: r.total,
      delivered: r.delivered,
      inProgress: r.inProgress,
      wrapComplete: r.wrapComplete,
      uniqueWrapstars: r.wrapstarSet.size,
      uniqueCouriers: r.courierSet.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export default async function AdminReportsPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();
  const orders = await listAllOrders();
  const rows = summarize(orders);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-semibold">Delivery Reports</h1>
      <p className="mt-1 text-sm text-slate-600">
        Daily summary for WrapStars (gift-wrap) and Drivers (courier).
      </p>
      <a
        href="/api/admin/reports/daily.csv"
        className="mt-3 inline-block rounded border px-3 py-2 text-sm hover:bg-slate-50"
      >
        Export Daily CSV
      </a>

      <div className="mt-4 overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left">Date (ET)</th>
              <th className="px-3 py-2 text-left">Total orders</th>
              <th className="px-3 py-2 text-left">Delivered</th>
              <th className="px-3 py-2 text-left">Open</th>
              <th className="px-3 py-2 text-left">Wraps complete</th>
              <th className="px-3 py-2 text-left">WrapStars used</th>
              <th className="px-3 py-2 text-left">Drivers used</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date} className="border-t">
                <td className="px-3 py-2">{r.date}</td>
                <td className="px-3 py-2">{r.total}</td>
                <td className="px-3 py-2">{r.delivered}</td>
                <td className="px-3 py-2">{r.inProgress}</td>
                <td className="px-3 py-2">{r.wrapComplete}</td>
                <td className="px-3 py-2">{r.uniqueWrapstars}</td>
                <td className="px-3 py-2">{r.uniqueCouriers}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={7}>
                  No data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
