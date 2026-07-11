import Link from "next/link";
import { getSession } from "@/lib/auth";
import { listAllOrders, listWrapstars } from "@/lib/data";
import { formatDateKeyNy } from "@/lib/ny-date";
import { wrrapdScheduledInstantIsoForUi } from "@/lib/order-schedule-display";
import { normalizeOrderStatus, orderWrapstarId, orderWrapstarName } from "@/lib/types";
import { AdminNav } from "@/components/admin-nav";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";

export const dynamic = "force-dynamic";

function pick(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

function monthMatrix(year: number, month0: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month0, 1));
  const startDow = first.getUTCDay(); // 0=Sun
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(month0 + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    cells.push(`${year}-${mm}-${dd}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

export default async function AdminOrdersCalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();

  const sp = await searchParams;
  const todayKey = formatInTimeZone(new Date(), "America/New_York", "yyyy-MM-dd");
  const dateKey = pick(sp.date) || todayKey;
  const ym = pick(sp.ym) || dateKey.slice(0, 7);
  const [yStr, mStr] = ym.split("-");
  const year = Number(yStr) || Number(todayKey.slice(0, 4));
  const month0 = (Number(mStr) || Number(todayKey.slice(5, 7))) - 1;

  const [orders, wrapstars] = await Promise.all([listAllOrders(), listWrapstars()]);
  const counts = new Map<string, number>();
  for (const o of orders) {
    const k = formatDateKeyNy(wrrapdScheduledInstantIsoForUi(o));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const dayOrders = orders
    .filter((o) => formatDateKeyNy(wrrapdScheduledInstantIsoForUi(o)) === dateKey)
    .sort((a, b) => a.id.localeCompare(b.id));

  const prevMonth = new Date(Date.UTC(year, month0 - 1, 1));
  const nextMonth = new Date(Date.UTC(year, month0 + 1, 1));
  const prevYm = `${prevMonth.getUTCFullYear()}-${String(prevMonth.getUTCMonth() + 1).padStart(2, "0")}`;
  const nextYm = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}`;
  const monthLabel = formatInTimeZone(new Date(Date.UTC(year, month0, 15)), "UTC", "MMMM yyyy");

  const wrapstarName = (id?: string) => wrapstars.find((w) => w.id === id)?.name;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <AdminNav current="/admin/orders" />
      <h1 className="text-2xl font-semibold text-slate-900">Orders calendar</h1>
      <p className="mt-1 text-sm text-slate-600">
        Click a date to review all orders scheduled that day (Eastern). Click a row for full detail.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[320px_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <Link href={`/admin/orders?ym=${prevYm}&date=${dateKey}`} className="text-sm text-blue-700 underline">
              Prev
            </Link>
            <h2 className="text-sm font-semibold">{monthLabel}</h2>
            <Link href={`/admin/orders?ym=${nextYm}&date=${dateKey}`} className="text-sm text-blue-700 underline">
              Next
            </Link>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {monthMatrix(year, month0).flat().map((cell, i) => {
              if (!cell) return <div key={`e-${i}`} className="h-10" />;
              const n = counts.get(cell) ?? 0;
              const selected = cell === dateKey;
              const isToday = cell === todayKey;
              return (
                <Link
                  key={cell}
                  href={`/admin/orders?ym=${ym}&date=${cell}`}
                  className={`flex h-10 flex-col items-center justify-center rounded-lg text-xs ${
                    selected
                      ? "bg-slate-900 text-white"
                      : isToday
                        ? "bg-amber-50 text-slate-900 ring-1 ring-amber-300"
                        : "bg-slate-50 text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  <span>{Number(cell.slice(8))}</span>
                  {n > 0 ? <span className={selected ? "text-amber-200" : "text-slate-500"}>{n}</span> : null}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold text-slate-900">
              {dateKey} · {dayOrders.length} order{dayOrders.length === 1 ? "" : "s"}
            </h2>
          </div>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Giftee</th>
                <th className="px-3 py-2">ZIP</th>
                <th className="px-3 py-2">Retailer</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">WrapStar</th>
              </tr>
            </thead>
            <tbody>
              {dayOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    No orders on this date.
                  </td>
                </tr>
              ) : (
                dayOrders.map((o) => {
                  const wsId = orderWrapstarId(o);
                  return (
                    <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <Link href={`/admin/orders/${o.id}`} className="font-medium text-blue-700 underline">
                          {o.externalOrderId || o.id}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{o.recipientName}</td>
                      <td className="px-3 py-2">
                        {o.postalCode}
                        <div className="text-xs text-slate-500">
                          {o.city}, {o.state}
                        </div>
                      </td>
                      <td className="px-3 py-2">{o.retailer || "—"}</td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">
                          {normalizeOrderStatus(o.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {wsId ? (
                          <Link href={`/admin/wrapstars/${wsId}`} className="text-blue-700 underline">
                            {orderWrapstarName(o) || wrapstarName(wsId) || wsId}
                            <div className="font-mono text-[10px] text-slate-500">{wsId}</div>
                          </Link>
                        ) : (
                          "Unassigned"
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
