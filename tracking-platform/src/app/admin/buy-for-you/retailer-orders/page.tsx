import Link from "next/link";
import { redirect } from "next/navigation";
import { RetailerOrderEcosystemLinks } from "@/components/retailer-order-ecosystem-links";
import { requireAdminSession } from "@/lib/auth";
import { etTime, listRetailerOrders, usd, ymdLabel, type RetailerOrder } from "@/lib/buy-for-you-admin";

export const dynamic = "force-dynamic";

function pick(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] || "" : "";
}

function Row({ o }: { o: RetailerOrder }) {
  return (
    <Link
      href={`/admin/buy-for-you/retailer-orders/${o.id}`}
      className="block rounded-xl border border-[#1a2744]/25 bg-white px-4 py-3 shadow-sm hover:border-[#c9a227]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-[#0f172a]">
            {o.retailerName} #{o.retailerOrderNumber}
          </p>
          <p className="text-sm text-slate-600">
            {o.id} · {o.hubName || o.hubZip} · {o.memberCount} customer order(s) · merch {usd(o.merchCents)}
          </p>
          <p className="mt-1 flex flex-wrap gap-2 text-xs">
            {o.members.slice(0, 8).map((m) => (
              <span key={`${m.batchId}-${m.addOnId || "main"}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                {m.batchId}
                {m.addOnId ? ` (${m.addOnId})` : ""}
              </span>
            ))}
            {o.members.length > 8 ? <span className="text-slate-500">+{o.members.length - 8} more</span> : null}
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="font-bold text-[#0f172a]">{usd(o.retailerTotalCents)}</p>
          <p className="text-slate-500">Hub {ymdLabel(o.arrivalDate)}</p>
          <p className="text-slate-500">
            {etTime(o.placedAt)} · {o.by}
          </p>
          <p
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
              o.status === "placed" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
            }`}
          >
            {o.status}
          </p>
        </div>
      </div>
    </Link>
  );
}

export default async function RetailerOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdminSession();
  if (!session) redirect("/admin?next=/admin/buy-for-you/retailer-orders");
  const sp = searchParams ? await searchParams : {};
  const q = pick(sp.q).trim();
  const retailer = pick(sp.retailer);
  const status = pick(sp.status);

  let orders: RetailerOrder[] = [];
  let loadError = "";
  try {
    const r = await listRetailerOrders({ q, retailer, status });
    orders = r.orders;
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not reach the pay server";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#0f172a]">Retailer orders</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Every checkout Wrrapd places at Ulta, Kohl&apos;s, Nordstrom, and the other stores. One retailer cart can cover
            several customer orders — open a row for links into those orders, Orders fulfillment, hub intake, and items
            purchased.
          </p>
        </div>
        <RetailerOrderEcosystemLinks />
      </div>

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Retailer #, WB-…, gifter, item"
          className="w-72 rounded-lg border border-slate-300 px-3 py-2"
        />
        <input
          name="retailer"
          defaultValue={retailer}
          placeholder="Retailer id (ulta…)"
          className="w-40 rounded-lg border border-slate-300 px-3 py-2"
        />
        <select name="status" defaultValue={status} className="rounded-lg border border-slate-300 px-3 py-2">
          <option value="">Any status</option>
          <option value="placed">Placed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button className="rounded-lg bg-[#1a2744] px-4 py-2 text-sm font-semibold text-white">Search</button>
      </form>

      {loadError ? <p className="font-semibold text-rose-700">{loadError}</p> : null}

      <p className="text-sm text-slate-600">{orders.length} retailer order(s)</p>
      <div className="space-y-3">
        {orders.length ? (
          orders.map((o) => <Row key={o.id} o={o} />)
        ) : (
          <p className="text-sm text-slate-500">
            No retailer orders yet. Record a placement from the{" "}
            <Link href="/admin/buy-for-you" className="font-semibold text-blue-800 underline">
              place queue
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
