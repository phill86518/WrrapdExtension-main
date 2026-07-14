import { SelectAllOrdersButton } from "@/components/select-all-orders-button";
import {
  assignStaffAction,
  deleteSelectedOrdersAction,
  reopenAssignedAction,
  updateStatusAction,
} from "@/app/admin/orders/actions";
import { defaultDemoDriverIdForPostal, defaultDemoWrapstarId } from "@/lib/demo-staffing";
import { formatDateKeyNy, toInstantDate } from "@/lib/ny-date";
import { wrrapdScheduledInstantIsoForUi } from "@/lib/order-schedule-display";
import { maxStopSequenceByRouteKey } from "@/lib/route-optimization";
import type { DeliveryDriver, Order, WrapStar } from "@/lib/types";
import { orderWrapstarId } from "@/lib/types";
import { formatInTimeZone } from "date-fns-tz";

function orderRowClass(status: string, delinquent?: boolean) {
  if (delinquent) {
    return "border-l-4 border-l-rose-600 bg-rose-50/90 ring-1 ring-rose-200/90";
  }
  if (status === "en_route" || status === "in_progress" || status === "out_for_delivery") {
    return "border-l-4 border-l-sky-600 bg-sky-100/80 ring-1 ring-sky-200/80";
  }
  if (status === "delivered") return "border-l-4 border-l-amber-500 bg-amber-100/80 ring-1 ring-amber-200/90";
  if (status === "cancelled" || status === "refunded") {
    return "border-l-4 border-l-stone-500 bg-stone-200/60 ring-1 ring-stone-300/80";
  }
  return "bg-white ring-1 ring-[#1a2744]/12";
}

type Column = {
  title: string;
  items: Order[];
  emptyHint: string;
};

export function AdminOrdersBoard({
  active,
  scheduled,
  delinquent,
  past,
  wrapstars,
  drivers,
}: {
  active: Order[];
  scheduled: Order[];
  delinquent: Order[];
  past: Order[];
  wrapstars: WrapStar[];
  drivers: DeliveryDriver[];
}) {
  const routeStopTotals = maxStopSequenceByRouteKey([...active, ...scheduled, ...delinquent]);
  const taylorId = defaultDemoWrapstarId();
  const approvedDrivers = drivers.filter((d) => d.status === "approved");
  const driverOptions = approvedDrivers.length > 0 ? approvedDrivers : drivers;

  const columns: Column[] = [
    {
      title: "Active",
      items: active,
      emptyHint: "No active deliveries for today or upcoming days.",
    },
    {
      title: "Scheduled",
      items: scheduled,
      emptyHint: "No pending/scheduled orders ahead.",
    },
    {
      title: "Delinquent",
      items: delinquent,
      emptyHint: "No past-due unfinished orders. Nice.",
    },
    {
      title: "Past",
      items: past,
      emptyHint: "No completed, cancelled, or refunded orders yet.",
    },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-4 lg:grid-cols-2">
      {columns.map((group) => {
        const deleteFormId = `delete-${group.title.toLowerCase()}`;
        const isDelinquentCol = group.title === "Delinquent";
        return (
          <section
            key={group.title}
            className={`overflow-hidden rounded-2xl border-2 bg-[#faf8f4] shadow-xl shadow-[#0f172a]/18 ring-1 ring-white/30 ${
              isDelinquentCol ? "border-rose-500/50" : "border-[#1a2744]/40"
            }`}
          >
            <div
              className={
                isDelinquentCol
                  ? "bg-gradient-to-r from-rose-800 via-rose-700 to-rose-600 px-4 py-3.5"
                  : "bg-gradient-to-r from-[#162a52] via-[#1e3a5f] to-[#2d4a7c] px-4 py-3.5"
              }
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">{group.title}</h2>
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold text-white">
                  {group.items.length}
                </span>
              </div>
              {isDelinquentCol ? (
                <p className="mt-1 text-[11px] font-medium text-rose-100">
                  Schedule day passed · still incomplete (assigned or not)
                </p>
              ) : null}
            </div>
            <div className="p-4">
              <form
                id={deleteFormId}
                action={deleteSelectedOrdersAction}
                className="flex flex-col gap-3 border-b-2 border-[#1a2744]/15 pb-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <SelectAllOrdersButton formId={deleteFormId} />
                  <button
                    className="inline-flex items-center justify-center rounded-xl bg-gradient-to-b from-rose-600 to-red-700 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-rose-900/30 ring-1 ring-white/25 transition hover:from-rose-500 hover:to-red-600 active:scale-[0.98]"
                    type="submit"
                  >
                    Delete selected
                  </button>
                </div>
              </form>
              <div className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                {group.items.map((order) => {
                  const displayScheduledIso = wrrapdScheduledInstantIsoForUi(order);
                  const wsSelected = orderWrapstarId(order) || taylorId;
                  const driverSelected =
                    order.courierDriverId || defaultDemoDriverIdForPostal(order.postalCode);
                  const wsName =
                    wrapstars.find((w) => w.id === orderWrapstarId(order))?.name ||
                    order.wrapstarName ||
                    "—";
                  const driverName =
                    drivers.find((d) => d.id === order.courierDriverId)?.name ||
                    order.courierDriverName ||
                    "—";
                  const unassigned = !orderWrapstarId(order) || !order.courierDriverId;
                  return (
                    <div
                      key={order.id}
                      className={`rounded-xl border-2 border-[#1a2744]/20 p-4 shadow-md ${orderRowClass(
                        order.status,
                        isDelinquentCol,
                      )}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="orderIds"
                            value={order.id}
                            form={deleteFormId}
                            className="h-4 w-4 rounded border-[#1a2744]/40 text-amber-600 focus:ring-2 focus:ring-amber-500"
                            title={`Select ${order.id} for deletion`}
                          />
                          <p className="font-semibold leading-tight text-[#0f172a]">
                            {order.externalOrderId?.trim() || order.id}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {order.stopSequence != null && (
                            <span className="rounded-lg bg-gradient-to-b from-[#1a2744] to-[#0f172a] px-2.5 py-1 text-xs font-bold text-white shadow-md">
                              Stop {order.stopSequence}
                              {orderWrapstarId(order)
                                ? (() => {
                                    const key = `${orderWrapstarId(order)}|${formatDateKeyNy(displayScheduledIso)}`;
                                    const total = routeStopTotals.get(key);
                                    const suffix =
                                      total != null && total > 1 ? ` of ${total}` : "";
                                    const dayEt = formatInTimeZone(
                                      toInstantDate(displayScheduledIso),
                                      "America/New_York",
                                      "MMM d",
                                    );
                                    return `${suffix} · ${dayEt}`;
                                  })()
                                : ""}
                            </span>
                          )}
                          <p className="text-xs font-bold uppercase tracking-wide text-[#1e3a5f]">
                            {order.status}
                          </p>
                        </div>
                      </div>
                      {isDelinquentCol && unassigned ? (
                        <p className="mt-2 rounded-lg bg-rose-100 px-2 py-1 text-xs font-bold text-rose-900">
                          Needs staffing — WrapStar and/or Driver missing
                        </p>
                      ) : null}
                      <p className="mt-2 text-sm font-medium text-[#0f172a]">{order.recipientName}</p>
                      <p className="text-sm text-[#2d4a38]">
                        {order.addressLine1}, {order.city}, {order.state} {order.postalCode}
                      </p>
                      <p className="mt-1 text-xs font-medium text-[#3d5c47]">
                        Scheduled:{" "}
                        {formatInTimeZone(
                          toInstantDate(displayScheduledIso),
                          "America/New_York",
                          "M/d/yyyy, h:mm:ss a zzz",
                        )}
                      </p>
                      <p className="mt-2 text-xs text-[#2d4a38]">
                        <span className="font-semibold text-[#0f172a]">WrapStar:</span> {wsName}
                        <span className="mx-2 text-slate-400">·</span>
                        <span className="font-semibold text-[#0f172a]">Driver:</span> {driverName}
                      </p>
                      <a
                        href={`/admin/orders/${order.id}`}
                        className="mt-3 inline-flex items-center justify-center rounded-xl border-2 border-[#1a2744]/50 bg-white px-4 py-2 text-sm font-bold text-[#0f172a] no-underline shadow-md transition hover:border-[#c9a227] hover:bg-[#fffef8] hover:shadow-lg"
                      >
                        View details
                      </a>

                      <form action={updateStatusAction} className="mt-3 flex flex-wrap items-center gap-2">
                        <input type="hidden" name="orderId" value={order.id} />
                        <select
                          name="status"
                          defaultValue={order.status === "en_route" ? "in_progress" : order.status}
                          className="rounded-xl border-2 border-[#1a2744]/25 bg-white px-3 py-2 text-sm font-medium text-[#0f172a] shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                        >
                          <option value="pending">pending</option>
                          <option value="scheduled">scheduled</option>
                          <option value="assigned">assigned</option>
                          <option value="accepted">accepted</option>
                          <option value="in_progress">in_progress</option>
                          <option value="out_for_delivery">out_for_delivery</option>
                          <option value="delivered">delivered</option>
                          <option value="cancelled">cancelled</option>
                          <option value="refunded">refunded</option>
                        </select>
                        <button
                          className="rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-4 py-2 text-sm font-bold text-[#1a1a1a] shadow-lg shadow-amber-900/25 ring-1 ring-white/40 transition hover:from-amber-300 hover:to-amber-500 active:scale-[0.98]"
                          type="submit"
                        >
                          Update status
                        </button>
                      </form>

                      {(order.status === "delivered" ||
                        order.status === "cancelled" ||
                        order.status === "refunded") && (
                        <form action={reopenAssignedAction} className="mt-2">
                          <input type="hidden" name="orderId" value={order.id} />
                          <button
                            type="submit"
                            className="w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-3 py-2.5 text-left text-sm font-bold text-amber-950 shadow-md ring-1 ring-amber-200/80 transition hover:from-amber-300 hover:to-amber-500"
                          >
                            Reopen as assigned
                          </button>
                        </form>
                      )}

                      <form action={assignStaffAction} className="mt-2 space-y-2">
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="postalCode" value={order.postalCode} />
                        <label className="block text-xs font-semibold uppercase tracking-wide text-[#1a2744]">
                          WrapStar (gift-wrapper)
                          <select
                            name="wrapstarId"
                            required
                            defaultValue={wsSelected}
                            className="mt-1 w-full rounded-xl border-2 border-[#1a2744]/25 bg-white px-3 py-2 text-sm font-medium text-[#0f172a] shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                          >
                            {wrapstars.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.name}
                                {w.id === taylorId ? " (demo)" : ""} ·{" "}
                                {w.wrapOnly || w.canDeliver === false ? "wrap-only" : "hybrid"} · ZIP{" "}
                                {w.homePostalCode}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-[#1a2744]">
                          Driver (courier)
                          <select
                            name="courierDriverId"
                            required
                            defaultValue={
                              driverOptions.some((d) => d.id === driverSelected)
                                ? driverSelected
                                : driverOptions[0]?.id || ""
                            }
                            className="mt-1 w-full rounded-xl border-2 border-[#1a2744]/25 bg-white px-3 py-2 text-sm font-medium text-[#0f172a] shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                          >
                            {driverOptions.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name} ·{" "}
                                {d.metroId === "jacksonville"
                                  ? "Jacksonville"
                                  : d.metroId === "atlanta"
                                    ? "Atlanta"
                                    : d.metroId}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className="w-full rounded-xl bg-gradient-to-b from-[#c9a227] to-[#a88417] px-5 py-2 text-sm font-bold text-[#1a1a12] shadow-lg shadow-amber-900/25 ring-1 ring-white/40 transition hover:from-[#d4ad32] hover:to-[#b8921f] active:scale-[0.98]"
                          type="submit"
                        >
                          Save WrapStar + Driver
                        </button>
                      </form>
                    </div>
                  );
                })}
                {group.items.length === 0 && (
                  <p className="py-8 text-center text-sm font-medium text-[#2d4a38]">{group.emptyHint}</p>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
