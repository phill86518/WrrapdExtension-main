import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { etTime, getRetailerOrder, usd, ymdLabel } from "@/lib/buy-for-you-admin";

export const dynamic = "force-dynamic";

export default async function RetailerOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  const { id } = await params;
  if (!session) redirect(`/admin?next=/admin/buy-for-you/retailer-orders/${encodeURIComponent(id)}`);

  let data: Awaited<ReturnType<typeof getRetailerOrder>> | null = null;
  let loadError = "";
  try {
    data = await getRetailerOrder(id);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load retailer order";
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Link href="/admin/buy-for-you/retailer-orders" className="text-sm text-blue-800 underline">
          ← Retailer orders
        </Link>
        <p className="font-semibold text-rose-700">{loadError || "Not found"}</p>
      </div>
    );
  }

  const { order: o, batches } = data;
  const batchById = new Map(batches.map((b) => [b.id, b]));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/buy-for-you/retailer-orders" className="text-sm text-blue-800 underline">
          ← Retailer orders
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-[#0f172a]">
          {o.retailerName} #{o.retailerOrderNumber}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {o.id} · {o.status} · placed {etTime(o.placedAt)} by {o.by}
          {o.poolKey ? ` · pool ${o.poolKey}` : ""}
        </p>
      </div>

      <section className="grid gap-4 rounded-2xl border border-[#1a2744]/25 bg-white p-5 shadow-sm sm:grid-cols-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Paid at retailer</p>
          <p className="text-2xl font-bold text-[#0f172a]">{usd(o.retailerTotalCents)}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Merchandise mapped</p>
          <p className="text-2xl font-bold text-[#0f172a]">{usd(o.merchCents)}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Hub arrival</p>
          <p className="text-2xl font-bold text-[#0f172a]">{ymdLabel(o.arrivalDate)}</p>
          <p className="text-sm text-slate-600">
            {o.hubName} {o.hubZip}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#1a2744]">
          Customer orders on this checkout ({o.memberCount})
        </h2>
        {o.members.map((m) => {
          const b = batchById.get(m.batchId);
          return (
            <div key={`${m.batchId}-${m.addOnId || "main"}`} className="rounded-xl border border-[#1a2744]/20 bg-white px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link href={`/admin/buy-for-you/${m.batchId}`} className="font-bold text-blue-800 underline">
                    {m.batchId}
                  </Link>
                  {m.addOnId ? <span className="ml-2 text-xs text-amber-800">add-on {m.addOnId}</span> : null}
                  <p className="text-sm text-slate-600">
                    {m.gifterName || b?.gifterName || "Shopper"}
                    {b?.email ? ` · ${b.email}` : ""} · ZIP {m.gifteeZip || b?.gifteeZip || "—"}
                    {b?.hub ? ` · ${b.hub}` : ""}
                  </p>
                  <ul className="mt-1 list-inside list-disc text-sm text-slate-700">
                    {(m.titles || []).map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold">{usd(m.merchCents)} merch</p>
                  {m.paidGroupSubtotalCents != null ? <p className="text-slate-500">Shopper paid {usd(m.paidGroupSubtotalCents)} for this retailer</p> : null}
                  {b?.totalCents != null ? <p className="text-slate-500">Order total {usd(b.totalCents)}</p> : null}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {o.log?.length ? (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#1a2744]">Log</h2>
          <ul className="space-y-1 text-sm text-slate-700">
            {o.log.map((row, i) => (
              <li key={`${row.at}-${i}`}>
                <span className="text-slate-500">{etTime(row.at)}</span> · {row.who}: {row.what}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
