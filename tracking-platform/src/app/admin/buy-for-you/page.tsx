import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import {
  etTime,
  fetchBuyConfig,
  isPast,
  listBuyBatches,
  listPlacePools,
  usd,
  type BuyBatchSummary,
  type PlacePool,
} from "@/lib/buy-for-you-admin";
import { placePoolAction } from "./actions";

export const dynamic = "force-dynamic";

function needsQuote(b: BuyBatchSummary) {
  return b.status === "open" && b.groups.some((g) => g.state === "needs_person");
}

function toPlace(b: BuyBatchSummary) {
  return b.status === "paid" && b.groups.some((g) => g.placement?.state === "to_place");
}

function inProgress(b: BuyBatchSummary) {
  return b.status === "paid" && !toPlace(b);
}

function poolStatusLabel(p: PlacePool) {
  if (p.status === "ready_threshold") return "Ready — free shipping";
  if (p.status === "due_schedule") return "Due — place now";
  return "Accumulating";
}

function poolStatusClass(p: PlacePool) {
  if (p.status === "ready_threshold") return "bg-emerald-100 text-emerald-900";
  if (p.status === "due_schedule") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-700";
}

function Row({ b }: { b: BuyBatchSummary }) {
  const desk = b.groups.filter((g) => g.state === "needs_person");
  const firstDeadline = desk.map((g) => g.deadlineAt).filter(Boolean).sort()[0];
  const overdue = firstDeadline ? isPast(firstDeadline) : false;
  return (
    <Link
      href={`/admin/buy-for-you/${b.id}`}
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1a2744]/25 bg-white px-4 py-3 shadow-sm hover:border-[#c9a227]"
    >
      <div className="min-w-0">
        <p className="font-bold text-[#0f172a]">
          {b.id}
          {b.refreshRunning ? <span className="ml-2 text-xs font-semibold text-amber-700">BOOKING REFRESH</span> : null}
        </p>
        <p className="text-sm text-slate-600">
          {b.gifterName || b.email || "Shopper"} · ZIP {b.gifteeZip} · {b.hub} · {b.lineCount} item(s)
        </p>
        <p className="mt-1 flex flex-wrap gap-2 text-xs">
          {b.groups.map((g) => (
            <span key={g.retailer} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
              {g.retailerName}: {g.placement?.state || g.state}
            </span>
          ))}
        </p>
      </div>
      <div className="text-right text-sm">
        {b.totalCents != null ? <p className="font-bold text-[#0f172a]">{usd(b.totalCents)}</p> : null}
        {b.refundedCents ? <p className="text-rose-700">Refunded {usd(b.refundedCents)}</p> : null}
        {firstDeadline ? (
          <p className={overdue ? "font-bold text-rose-700" : "text-amber-800"}>
            Quote due {etTime(firstDeadline)}
          </p>
        ) : (
          <p className="text-slate-500">{etTime(b.updatedAt)}</p>
        )}
      </div>
    </Link>
  );
}

function Section({ title, blurb, rows, empty }: { title: string; blurb: string; rows: BuyBatchSummary[]; empty: string }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#1a2744]">
          {title} ({rows.length})
        </h2>
        <p className="mt-1 text-sm text-[#2d4a38]">{blurb}</p>
      </div>
      {rows.length ? rows.map((b) => <Row key={b.id} b={b} />) : <p className="text-sm text-slate-500">{empty}</p>}
    </section>
  );
}

export default async function BuyForYouPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdminSession();
  if (!session) redirect("/admin?next=/admin/buy-for-you");
  const sp = searchParams ? await searchParams : {};
  const showAll = sp.all === "1";

  let batches: BuyBatchSummary[] | null = null;
  let pools: PlacePool[] = [];
  let placeIntervalHours: 1 | 2 = 1;
  let mode = "";
  let loadError = "";
  try {
    const [rows, cfg, poolData] = await Promise.all([listBuyBatches(), fetchBuyConfig(), listPlacePools()]);
    batches = rows;
    mode = cfg.config.mode;
    pools = poolData.pools || [];
    placeIntervalHours = poolData.placeIntervalHours || cfg.config.placeIntervalHours || 1;
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not reach the pay server";
  }

  const desk = (batches || []).filter(needsQuote);
  const place = (batches || []).filter(toPlace);
  const progress = (batches || []).filter(inProgress);
  const shopping = (batches || []).filter((b) => b.status === "open" && !needsQuote(b));
  const closed = (batches || []).filter((b) => b.status === "closed" || b.status === "expired");
  const manualOpen = (batches || []).reduce((s, b) => s + (b.manualOpen || 0), 0);
  const actionablePools = pools.filter((p) => p.actionable);
  const waitingPools = pools.filter((p) => !p.actionable);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-blue-800 underline">
            ← Command Center
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-[#0f172a]">Website order queue</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Shoppers paste retailer links on wrrapd.com/buy. Read the retailer cost page and send quotes, place paid
            orders with the hub as the ship-to address, then each same-day arrival lands in Orders like an extension
            order.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span
            className={`rounded-full px-3 py-1 font-bold uppercase ${
              mode === "live" ? "bg-emerald-100 text-emerald-800" : mode === "test" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700"
            }`}
          >
            {mode || "?"}
          </span>
          <Link
            href="/admin/buy-for-you/manual"
            className={`rounded-lg border px-3 py-2 font-semibold ${manualOpen ? "border-amber-500 bg-amber-50 text-amber-900" : "border-[#1a2744]/40 bg-white"}`}
          >
            Manual additions{manualOpen ? ` (${manualOpen})` : ""}
          </Link>
          <Link href="/admin/buy-for-you/retailer-orders" className="rounded-lg border border-[#1a2744]/40 bg-white px-3 py-2 font-semibold">
            Retailer orders
          </Link>
          <Link href="/admin/buy-for-you/purchases" className="rounded-lg border border-[#1a2744]/40 bg-white px-3 py-2 font-semibold">
            Items we purchased
          </Link>
          <Link href="/admin/buy-for-you/settings" className="rounded-lg border border-[#1a2744]/40 bg-white px-3 py-2 font-semibold">
            Settings & workflows
          </Link>
          <Link href="/admin/orders" className="rounded-lg border border-[#1a2744]/40 bg-white px-3 py-2 font-semibold">
            Orders
          </Link>
        </div>
      </div>

      {loadError ? <p className="font-semibold text-rose-700">{loadError}</p> : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#1a2744]">
            Place pools ({pools.length})
          </h2>
          <p className="mt-1 text-sm text-[#2d4a38]">
            Paid orders waiting to buy are grouped only when they share the same retailer and the same hub address.
            Orders headed to different hubs stay in separate carts, including free shipping. Place when free shipping is
            hit, or at the next {placeIntervalHours}-hour Eastern boundary even if shipping still applies. Buy once at
            the retailer, then record one checkout below — every customer order in that pool is mapped to that retailer
            order.
          </p>
        </div>
        {!pools.length ? (
          <p className="text-sm text-slate-500">No paid groups waiting to place.</p>
        ) : (
          <div className="space-y-3">
            {[...actionablePools, ...waitingPools].map((p) => (
              <div
                key={p.poolKey}
                className="rounded-xl border border-[#1a2744]/25 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-[#0f172a]">
                      {p.retailerName} → {p.hubName || p.hubZip}
                    </p>
                    <p className="text-sm text-slate-600">
                      {usd(p.merchCents)} merchandise · {p.memberCount} order(s)
                      {p.freeOverCents != null
                        ? p.freeOverCents === 0
                          ? " · always free ship"
                          : ` · free ship from ${usd(p.freeOverCents)}`
                        : ""}
                      {p.shipCentsIfPlaced != null
                        ? p.shipCentsIfPlaced === 0
                          ? " · ship $0 if placed now"
                          : ` · est. ship ${usd(p.shipCentsIfPlaced)} if placed now`
                        : ""}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-2 text-xs">
                      {p.members.map((m) => (
                        <Link
                          key={m.batchId}
                          href={`/admin/buy-for-you/${m.batchId}`}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-blue-800 underline"
                        >
                          {m.batchId} ({usd(m.merchCents)})
                        </Link>
                      ))}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold ${poolStatusClass(p)}`}>
                      {poolStatusLabel(p)}
                    </span>
                    {p.dueAt && p.status === "accumulating" ? (
                      <p className="mt-1 text-slate-500">Due {etTime(p.dueAt)}</p>
                    ) : null}
                  </div>
                </div>
                {p.actionable ? (
                  <form action={placePoolAction} className="mt-3 grid gap-2 rounded-lg border border-emerald-300 bg-emerald-50/70 p-3 sm:grid-cols-4">
                    <input type="hidden" name="poolKey" value={p.poolKey} />
                    <p className="text-xs font-semibold text-[#0f172a] sm:col-span-4">
                      After you check out at {p.retailerName} with all {p.memberCount} order(s) in one cart, record that
                      checkout once. Shoppers paid <b>{usd(p.paidCapCents || 0)}</b> for {p.retailerName} across these
                      orders (items + shipping + tax). The retailer total you enter must not exceed that — if it does,
                      the error shows entered vs paid and how much over.
                    </p>
                    <label className="text-xs">
                      Retailer order #
                      <input name="retailerOrderNumber" required className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5" />
                    </label>
                    <label className="text-xs">
                      Retailer total $
                      <input name="retailerTotal" required inputMode="decimal" className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5" />
                    </label>
                    <label className="text-xs">
                      Arrives at hub
                      <input type="date" name="arrivalDate" required className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5" />
                    </label>
                    <div className="flex items-end">
                      <button className="w-full rounded-lg bg-[#1a2744] px-3 py-2 text-sm font-semibold text-white">
                        Record pooled checkout
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <Section
        title="Quote desk"
        blurb="Open the retailer cost page with the hub address, read prices, shipping options, and tax, then back out without paying."
        rows={desk}
        empty="No quotes waiting."
      />
      <Section
        title="Paid — place at the retailer"
        blurb="Buy with the Wrrapd retailer account shipping to the hub. Record the retailer order number to send it to Orders. Prefer the place pools section above when combining carts."
        rows={place}
        empty="Nothing to place."
      />
      <Section
        title="Placed — on the way"
        blurb="Retailer orders are recorded. Returns and cancellations start here."
        rows={showAll ? progress : progress.slice(0, 30)}
        empty="Nothing in progress."
      />
      <Section
        title="Shoppers building a bill"
        blurb="Open batches that are reading links or waiting on the shopper."
        rows={showAll ? shopping : shopping.slice(0, 20)}
        empty="No open batches."
      />
      <Section title="Closed and expired" blurb="Fully refunded, cancelled, or never paid." rows={showAll ? closed : closed.slice(0, 15)} empty="None yet." />
      {!showAll ? (
        <Link href="/admin/buy-for-you?all=1" className="text-sm text-blue-800 underline">
          Show everything
        </Link>
      ) : null}
    </div>
  );
}
