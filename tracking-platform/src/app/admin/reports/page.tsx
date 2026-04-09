import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listAllOrders } from "@/lib/data";
import { formatDateKeyNy } from "@/lib/ny-date";

export const dynamic = "force-dynamic";

type Row = {
  date: string;
  total: number;
  delivered: number;
  inProgress: number;
  uniqueDrivers: number;
};

function summarize(rows: Awaited<ReturnType<typeof listAllOrders>>): Row[] {
  const map = new Map<string, Row & { driverSet: Set<string> }>();
  for (const o of rows) {
    const date = formatDateKeyNy(o.scheduledFor);
    const cur = map.get(date) ?? {
      date,
      total: 0,
      delivered: 0,
      inProgress: 0,
      uniqueDrivers: 0,
      driverSet: new Set<string>(),
    };
    cur.total += 1;
    if (o.status === "delivered") cur.delivered += 1;
    if (o.status === "assigned" || o.status === "en_route") cur.inProgress += 1;
    if (o.driverId) cur.driverSet.add(o.driverId);
    map.set(date, cur);
  }
  return [...map.values()]
    .map((r) => ({ ...r, uniqueDrivers: r.driverSet.size }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export default async function AdminReportsPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();
  const orders = await listAllOrders();
  const rows = summarize(orders);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <a href="/admin" className="text-sm text-blue-700 underline">
        Back to dashboard
      </a>
      <h1 className="mt-3 text-3xl font-semibold">Delivery Reports</h1>
      <p className="mt-1 text-sm text-slate-600">
        Daily summary for planning and load balancing.
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
              <th className="px-3 py-2 text-left">Open (assigned/en_route)</th>
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
                <td className="px-3 py-2">{r.uniqueDrivers}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={5}>
                  No data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
