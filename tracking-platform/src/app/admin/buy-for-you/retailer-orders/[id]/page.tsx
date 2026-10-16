import Link from "next/link";
import { redirect } from "next/navigation";
import { RetailerOrderEcosystemLinks } from "@/components/retailer-order-ecosystem-links";
import { requireAdminSession } from "@/lib/auth";
import { etTime, getRetailerOrder, usd, ymdLabel } from "@/lib/buy-for-you-admin";
import { listAllOrders } from "@/lib/data";
import { normalizeRetailerOrderNumber } from "@/lib/retailer-order-ref";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";

function ordersForRetailerCheckout(
  all: Order[],
  retailerOrderNumber: string,
  batchIds: string[],
): Order[] {
  const want = normalizeRetailerOrderNumber(retailerOrderNumber);
  const prefixes = batchIds.map((id) => `${id}-`);
  return all.filter((ord) => {
    if (want && ord.retailerOrderNumbers?.some((n) => normalizeRetailerOrderNumber(n) === want)) return true;
    const ext = ord.externalOrderId?.trim() || "";
    return prefixes.some((p) => ext.startsWith(p));
  });
}

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
  const batchIds = [...new Set(o.members.map((m) => m.batchId))];
  const fulfillmentOrders = await listAllOrders()
    .then((all) => ordersForRetailerCheckout(all, o.retailerOrderNumber, batchIds))
    .catch(() => [] as Order[]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
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
        <RetailerOrderEcosystemLinks retailerOrderNumber={o.retailerOrderNumber} />
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
          In Orders ({fulfillmentOrders.length})
        </h2>
        {fulfillmentOrders.length ? (
          <ul className="space-y-2">
            {fulfillmentOrders.map((ord) => (
              <li key={ord.id} className="rounded-xl border border-[#1a2744]/20 bg-white px-4 py-3 text-sm">
                <Link href={`/admin/orders/${ord.id}`} className="font-bold text-blue-800 underline">
                  {ord.externalOrderId || ord.id}
                </Link>
                <span className="ml-2 uppercase text-slate-500">{ord.status}</span>
                <p className="mt-1 text-slate-600">
                  {ord.customerName || "Shopper"} → {ord.recipientName || "giftee"}
                  {ord.retailerOrderNumbers?.length
                    ? ` · packing slip ${ord.retailerOrderNumbers.join(", ")}`
                    : " · packing slip not captured"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">
            No matching Orders yet. Place from the{" "}
            <Link href="/admin/buy-for-you" className="font-semibold text-blue-800 underline">
              place queue
            </Link>{" "}
            or resend ingest from a customer order page.
          </p>
        )}
        <p className="text-sm">
          <Link
            href={`/admin/intake?q=${encodeURIComponent(o.retailerOrderNumber)}`}
            className="font-semibold text-blue-800 underline"
          >
            Open hub intake for #{o.retailerOrderNumber}
          </Link>
          {" · "}
          <Link
            href={`/admin/buy-for-you/purchases?q=${encodeURIComponent(o.retailerOrderNumber)}`}
            className="font-semibold text-blue-800 underline"
          >
            Items on this retailer order
          </Link>
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#1a2744]">
          Customer orders on this checkout ({o.memberCount})
        </h2>
        {o.members.map((m) => {
          const b = batchById.get(m.batchId);
          const memberOrders = fulfillmentOrders.filter((ord) =>
            (ord.externalOrderId || "").startsWith(`${m.batchId}-`),
          );
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
                  {memberOrders.length ? (
                    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                      {memberOrders.map((ord) => (
                        <Link key={ord.id} href={`/admin/orders/${ord.id}`} className="font-semibold text-blue-800 underline">
                          Orders: {ord.externalOrderId || ord.id}
                        </Link>
                      ))}
                    </p>
                  ) : null}
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold">{usd(m.merchCents)} merch</p>
                  {m.paidGroupSubtotalCents != null ? (
                    <p className="text-slate-500">Shopper paid {usd(m.paidGroupSubtotalCents)} for this retailer</p>
                  ) : null}
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
