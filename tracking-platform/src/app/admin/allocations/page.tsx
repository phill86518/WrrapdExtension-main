import Link from "next/link";
import { notFound } from "next/navigation";
import {
  approveProposedAction,
  holdUnallocatedAction,
  manualAssignAction,
} from "@/app/admin/allocations/actions";
import { SameOriginLogoutLink } from "@/components/same-origin-logout-link";
import { getSession } from "@/lib/auth";
import { ALLOCATION_RADIUS_MILES } from "@/lib/allocation";
import { listAllocationQueue, listCourierDrivers, listWrapstars } from "@/lib/data";
import { ensureDemoStaffing } from "@/lib/demo-staffing";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";

function pickSearchParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
  return undefined;
}

function publicRef(o: Order): string {
  return o.externalOrderId?.trim() || o.id;
}

function addressLine(o: Order): string {
  return [o.addressLine1, [o.city, o.state, o.postalCode].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(" · ");
}

export default async function AdminAllocationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();

  const raw = searchParams ? await searchParams : {};
  const error = pickSearchParam(raw.error);
  const ok = pickSearchParam(raw.ok);

  let queue: Order[] = [];
  let wrapstars: Awaited<ReturnType<typeof listWrapstars>> = [];
  let drivers: Awaited<ReturnType<typeof listCourierDrivers>> = [];
  try {
    await ensureDemoStaffing();
    [queue, wrapstars, drivers] = await Promise.all([
      listAllocationQueue(),
      listWrapstars(),
      listCourierDrivers(),
    ]);
  } catch (err) {
    console.error("[admin/allocations] failed to load", err);
    return (
      <div className="rounded-2xl border-2 border-rose-300 bg-[#faf8f4] p-6 shadow-xl">
        <h1 className="text-2xl font-semibold text-[#0f172a]">Allocations unavailable</h1>
        <p className="mt-3 text-slate-700">Could not load the allocation queue.</p>
        <p className="mt-2 text-sm text-slate-500">
          <SameOriginLogoutLink redirectPath="/admin" className="text-blue-700 underline">
            Log out
          </SameOriginLogoutLink>
        </p>
      </div>
    );
  }

  const proposed = queue.filter((o) => o.allocationStatus === "proposed");
  const unallocated = queue.filter((o) => o.allocationStatus !== "proposed");
  const approvedDrivers = drivers.filter((d) => d.status === "approved");
  const driverOptions = approvedDrivers.length ? approvedDrivers : drivers;

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border-2 border-[#1a2744]/40 bg-[#faf8f4] p-6 shadow-xl">
        <h1 className="text-3xl font-bold tracking-tight text-[#0f172a]">Allocations</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#2d4a38]">
          New checkouts stay here until you approve. Auto-match only proposes a WrapStar (and JoyRider
          when needed) within <strong>{ALLOCATION_RADIUS_MILES} miles</strong> of the giftee ZIP. If
          nobody is in range, the order stays unallocated for a manual assign. Approved orders then
          appear on Orders, WrapStars, and JoyRiders.
        </p>
        <p className="mt-3 text-sm font-medium text-[#1a2744]">
          {proposed.length} proposed · {unallocated.length} unallocated
        </p>
        {error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        ) : null}
        {ok === "approved" ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Allocation approved — the order is now on the live boards.
          </p>
        ) : null}
        {ok === "held" ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Proposal cleared. The order stays here for a manual assign.
          </p>
        ) : null}
        {ok === "manual" ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Manual allocation saved — the order is now on the live boards.
          </p>
        ) : null}
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-[#0f172a]">Proposed ({proposed.length})</h2>
        {proposed.length === 0 ? (
          <p className="rounded-xl border border-[#1a2744]/15 bg-white px-4 py-6 text-sm text-slate-600">
            No automatic matches waiting. New orders in range will show up here.
          </p>
        ) : (
          proposed.map((o) => (
            <article
              key={o.id}
              className="rounded-2xl border-2 border-[#1a2744]/25 bg-white p-5 shadow-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">
                    {o.retailer || "Order"} · {publicRef(o)}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-[#0f172a]">{o.recipientName}</h3>
                  <p className="mt-1 text-sm text-[#334155]">{addressLine(o)}</p>
                  <p className="mt-1 text-xs text-slate-500">Gifter {o.customerName}</p>
                </div>
                <Link
                  href={`/admin/orders/${o.id}`}
                  className="text-sm font-semibold text-blue-800 underline"
                >
                  Order detail
                </Link>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-900">
                    WrapStar
                  </p>
                  <p className="mt-1 font-semibold text-[#0f172a]">
                    {o.proposedWrapstarName || "—"}
                  </p>
                  <p className="text-xs text-emerald-900">
                    {o.proposedDistanceMiles != null
                      ? `${o.proposedDistanceMiles.toFixed(1)} miles from giftee ZIP`
                      : "Distance unknown"}
                  </p>
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-900">
                    JoyRider
                  </p>
                  <p className="mt-1 font-semibold text-[#0f172a]">
                    {o.proposedCourierDriverName ||
                      (o.proposedFulfillmentMode === "self_delivery"
                        ? "WrapStar delivers"
                        : "Not matched — assign below if needed")}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <form action={approveProposedAction}>
                  <input type="hidden" name="orderId" value={o.id} />
                  <button
                    type="submit"
                    className="rounded-xl bg-gradient-to-b from-[#c9a227] to-[#a88417] px-4 py-2 text-sm font-bold text-[#1a1a12] shadow"
                  >
                    Approve allocation
                  </button>
                </form>
                <form action={holdUnallocatedAction}>
                  <input type="hidden" name="orderId" value={o.id} />
                  <button
                    type="submit"
                    className="rounded-xl border border-[#1a2744]/25 bg-white px-4 py-2 text-sm font-semibold text-[#1a2744]"
                  >
                    Hold for manual
                  </button>
                </form>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-[#0f172a]">Unallocated ({unallocated.length})</h2>
        {unallocated.length === 0 ? (
          <p className="rounded-xl border border-[#1a2744]/15 bg-white px-4 py-6 text-sm text-slate-600">
            Every open order either has a proposal or is already on the live boards.
          </p>
        ) : (
          unallocated.map((o) => (
            <article
              key={o.id}
              className="rounded-2xl border-2 border-amber-300/80 bg-[#fffdf6] p-5 shadow-md"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                {o.retailer || "Order"} · {publicRef(o)} · no WrapStar within {ALLOCATION_RADIUS_MILES}{" "}
                miles
              </p>
              <h3 className="mt-1 text-lg font-bold text-[#0f172a]">{o.recipientName}</h3>
              <p className="mt-1 text-sm text-[#334155]">{addressLine(o)}</p>
              <p className="mt-1 text-xs text-slate-500">Gifter {o.customerName}</p>
              <form action={manualAssignAction} className="mt-4 grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="orderId" value={o.id} />
                <label className="text-sm font-medium text-[#1a2744]">
                  WrapStar
                  <select
                    name="wrapstarId"
                    required
                    className="mt-1 w-full rounded-lg border border-[#1a2744]/25 bg-white px-3 py-2 text-sm"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Choose…
                    </option>
                    {wrapstars.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} · {w.homePostalCode}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-[#1a2744]">
                  JoyRider
                  <select
                    name="courierDriverId"
                    className="mt-1 w-full rounded-lg border border-[#1a2744]/25 bg-white px-3 py-2 text-sm"
                    defaultValue=""
                  >
                    <option value="">WrapStar delivers / none</option>
                    {driverOptions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-[#1a2744] px-4 py-2 text-sm font-bold text-white"
                  >
                    Assign &amp; release
                  </button>
                </div>
              </form>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
