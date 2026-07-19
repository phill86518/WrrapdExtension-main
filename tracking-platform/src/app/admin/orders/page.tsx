import Link from "next/link";
import { AdminCreateDeliverySection } from "@/components/admin-create-delivery-section";
import { AdminOrdersBoard } from "@/components/admin-orders-board";
import { SameOriginLogoutLink } from "@/components/same-origin-logout-link";
import { createOrderAction } from "@/app/admin/orders/actions";
import { getSession } from "@/lib/auth";
import {
  listCourierDrivers,
  listOrdersByStatus,
  listWrapstars,
} from "@/lib/data";
import { ensureDemoStaffing } from "@/lib/demo-staffing";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function pickSearchParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
  return undefined;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();

  const raw = searchParams ? await searchParams : {};
  const createError = pickSearchParam(raw.createError);
  const assignError = pickSearchParam(raw.assignError);

  let active: Awaited<ReturnType<typeof listOrdersByStatus>>;
  let scheduled: Awaited<ReturnType<typeof listOrdersByStatus>>;
  let delinquent: Awaited<ReturnType<typeof listOrdersByStatus>>;
  let past: Awaited<ReturnType<typeof listOrdersByStatus>>;
  let wrapstars: Awaited<ReturnType<typeof listWrapstars>>;
  let drivers: Awaited<ReturnType<typeof listCourierDrivers>>;

  try {
    await ensureDemoStaffing();
    const settled = await Promise.allSettled([
      listOrdersByStatus("active"),
      listOrdersByStatus("scheduled"),
      listOrdersByStatus("delinquent"),
      listOrdersByStatus("past"),
      listWrapstars(),
      listCourierDrivers(),
    ]);
    const labels = [
      "orders:active",
      "orders:scheduled",
      "orders:delinquent",
      "orders:past",
      "wrapstars",
      "drivers",
    ] as const;
    settled.forEach((r, i) => {
      if (r.status === "rejected") {
        const reason = r.reason;
        const msg = reason instanceof Error ? reason.message : String(reason);
        console.error(`[admin/orders] load failed (${labels[i]}):`, msg, reason);
      }
    });
    const failed = settled.find((r) => r.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    active = (settled[0] as PromiseFulfilledResult<typeof active>).value;
    scheduled = (settled[1] as PromiseFulfilledResult<typeof scheduled>).value;
    delinquent = (settled[2] as PromiseFulfilledResult<typeof delinquent>).value;
    past = (settled[3] as PromiseFulfilledResult<typeof past>).value;
    wrapstars = (settled[4] as PromiseFulfilledResult<typeof wrapstars>).value;
    drivers = (settled[5] as PromiseFulfilledResult<typeof drivers>).value;
  } catch (err) {
    console.error("[admin/orders] failed to load", err);
    return (
      <div className="rounded-2xl border-2 border-rose-300 bg-[#faf8f4] p-6 shadow-xl">
        <h1 className="text-2xl font-semibold text-[#0f172a]">Orders unavailable</h1>
        <p className="mt-3 text-[#2d4a38]">
          Loading orders failed. Check Cloud Run logs for{" "}
          <code className="rounded bg-slate-100 px-1 text-sm">[admin/orders]</code>.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          <SameOriginLogoutLink redirectPath="/admin" className="text-blue-700 underline">
            Log out
          </SameOriginLogoutLink>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border-2 border-[#1a2744]/40 bg-[#faf8f4] p-6 shadow-xl shadow-[#0f172a]/20 ring-1 ring-white/40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#c9a227]">Operations</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#0f172a]">Orders</h1>
            <p className="mt-1 max-w-2xl text-sm font-medium text-[#2d4a38]">
              Click a category to show details. Delinquent = past schedule day still incomplete. Past =
              delivered / cancelled / refunded.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin/orders/calendar"
              className="inline-flex items-center justify-center rounded-xl border-2 border-[#1a2744]/50 bg-white px-4 py-2.5 text-sm font-bold text-[#0f172a] shadow-md transition hover:border-[#c9a227]"
            >
              Calendar view
            </Link>
            <AdminCreateDeliverySection createOrderAction={createOrderAction} createError={createError} />
          </div>
        </div>
        {assignError ? (
          <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
            {assignError}
          </p>
        ) : null}
        {delinquent.length > 0 ? (
          <p className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
            {delinquent.length} delinquent order{delinquent.length === 1 ? "" : "s"} — schedule day has
            passed and the order is not delivered/cancelled. Assign staff or update status in the
            Delinquent column.
          </p>
        ) : null}
      </div>

      <AdminOrdersBoard
        active={active}
        scheduled={scheduled}
        delinquent={delinquent}
        past={past}
        wrapstars={wrapstars}
        drivers={drivers}
      />
    </div>
  );
}
