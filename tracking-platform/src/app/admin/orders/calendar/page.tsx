import Link from "next/link";
import { getSession } from "@/lib/auth";
import { listAllOrders, listWrapstars, listCourierDrivers } from "@/lib/data";
import { formatDateKeyNy } from "@/lib/ny-date";
import { wrrapdScheduledInstantIsoForUi } from "@/lib/order-schedule-display";
import { normalizeOrderStatus, orderWrapstarId, orderWrapstarName, resolveFulfillmentMode } from "@/lib/types";
import { wrapPhaseLabel } from "@/lib/wrap-status-display";
import { ensureDemoStaffing } from "@/lib/demo-staffing";
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
  const startDow = first.getUTCDay();
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

  await ensureDemoStaffing();

  const sp = await searchParams;
  const todayKey = formatInTimeZone(new Date(), "America/New_York", "yyyy-MM-dd");
  const dateKey = pick(sp.date) || todayKey;
  const ym = pick(sp.ym) || dateKey.slice(0, 7);
  const [yStr, mStr] = ym.split("-");
  const year = Number(yStr) || Number(todayKey.slice(0, 4));
  const month0 = (Number(mStr) || Number(todayKey.slice(5, 7))) - 1;

  const [orders, wrapstars, drivers] = await Promise.all([
    listAllOrders(),
    listWrapstars(),
    listCourierDrivers(),
  ]);
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
  const driverName = (id?: string) => drivers.find((d) => d.id === id)?.name;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border-2 border-[#1a2744]/40 bg-[#faf8f4] p-6 shadow-xl ring-1 ring-white/40">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#c9a227]">Orders</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#0f172a]">Calendar</h1>
            <p className="mt-1 text-sm font-medium text-[#2d4a38]">
              Browse by Eastern calendar day. Use the boards for staffing and status.
            </p>
          </div>
          <Link
            href="/admin/orders"
            className="inline-flex items-center justify-center rounded-xl border-2 border-[#1a2744]/50 bg-white px-4 py-2.5 text-sm font-bold text-[#0f172a] shadow-md transition hover:border-[#c9a227]"
          >
            ← Orders boards
          </Link>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <section className="rounded-2xl border-2 border-[#1a2744]/30 bg-[#faf8f4] p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <Link
              href={`/admin/orders/calendar?ym=${prevYm}&date=${dateKey}`}
              className="text-sm font-semibold text-[#1a2744] underline"
            >
              Prev
            </Link>
            <h2 className="text-sm font-bold text-[#0f172a]">{monthLabel}</h2>
            <Link
              href={`/admin/orders/calendar?ym=${nextYm}&date=${dateKey}`}
              className="text-sm font-semibold text-[#1a2744] underline"
            >
              Next
            </Link>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {monthMatrix(year, month0)
              .flat()
              .map((cell, i) => {
                if (!cell) return <div key={`e-${i}`} className="h-10" />;
                const n = counts.get(cell) ?? 0;
                const selected = cell === dateKey;
                const isToday = cell === todayKey;
                return (
                  <Link
                    key={cell}
                    href={`/admin/orders/calendar?ym=${ym}&date=${cell}`}
                    className={`flex h-10 flex-col items-center justify-center rounded-lg text-xs ${
                      selected
                        ? "bg-[#0f172a] text-white"
                        : isToday
                          ? "bg-amber-50 text-slate-900 ring-1 ring-amber-300"
                          : "bg-white text-slate-800 hover:bg-slate-100"
                    }`}
                  >
                    <span>{Number(cell.slice(8))}</span>
                    {n > 0 ? (
                      <span className={selected ? "text-amber-200" : "text-slate-500"}>{n}</span>
                    ) : null}
                  </Link>
                );
              })}
          </div>
        </section>

        <section className="overflow-x-auto rounded-2xl border-2 border-[#1a2744]/30 bg-[#faf8f4] shadow-lg">
          <div className="border-b border-[#1a2744]/15 px-4 py-3">
            <h2 className="font-bold text-[#0f172a]">
              {dateKey} · {dayOrders.length} order{dayOrders.length === 1 ? "" : "s"}
            </h2>
          </div>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#1a2744]/5 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Giftee</th>
                <th className="px-3 py-2">ZIP</th>
                <th className="px-3 py-2">Retailer</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Wrap</th>
                <th className="px-3 py-2">WrapStar</th>
                <th className="px-3 py-2">Driver</th>
              </tr>
            </thead>
            <tbody>
              {dayOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    No orders on this date.
                  </td>
                </tr>
              ) : (
                dayOrders.map((o) => {
                  const wsId = orderWrapstarId(o);
                  const ws = wrapstars.find((w) => w.id === wsId);
                  const mode = resolveFulfillmentMode(o, ws);
                  return (
                    <tr key={o.id} className="border-t border-[#1a2744]/10 hover:bg-white/70">
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
                      <td className="px-3 py-2 text-xs font-medium">
                        {wrapPhaseLabel(o.wrapPhase)}
                        {o.readyForCourierAt ? (
                          <div className="text-[10px] text-sky-800">Courier-ready</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        {wsId ? (
                          <Link href={`/admin/wrapstars/${wsId}`} className="text-blue-700 underline">
                            {orderWrapstarName(o) || wrapstarName(wsId) || wsId}
                          </Link>
                        ) : (
                          "Unassigned"
                        )}
                        {wsId ? (
                          <div className="font-mono text-[10px] text-slate-500">{wsId}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        {o.courierDriverId ? (
                          <Link
                            href={`/admin/drivers/${o.courierDriverId}`}
                            className="text-blue-700 underline"
                          >
                            {o.courierDriverName || driverName(o.courierDriverId) || o.courierDriverId}
                          </Link>
                        ) : mode === "self_delivery" ? (
                          <span className="text-slate-600">Self-delivery</span>
                        ) : (
                          "Unassigned"
                        )}
                        {o.courierDriverId ? (
                          <div className="font-mono text-[10px] text-slate-500">{o.courierDriverId}</div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
