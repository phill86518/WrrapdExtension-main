import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { etTime, fetchBuyConfig, isPast, listBuyBatches, usd, type BuyBatchSummary } from "@/lib/buy-for-you-admin";

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
  let mode = "";
  let loadError = "";
  try {
    const [rows, cfg] = await Promise.all([listBuyBatches(), fetchBuyConfig()]);
    batches = rows;
    mode = cfg.config.mode;
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not reach the pay server";
  }

  const desk = (batches || []).filter(needsQuote);
  const place = (batches || []).filter(toPlace);
  const progress = (batches || []).filter(inProgress);
  const shopping = (batches || []).filter((b) => b.status === "open" && !needsQuote(b));
  const closed = (batches || []).filter((b) => b.status === "closed" || b.status === "expired");

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

      <Section
        title="Quote desk"
        blurb="Open the retailer cost page with the hub address, read prices, shipping options, and tax, then back out without paying."
        rows={desk}
        empty="No quotes waiting."
      />
      <Section
        title="Paid — place at the retailer"
        blurb="Buy with the Wrrapd retailer account shipping to the hub. Record the retailer order number to send it to Orders."
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
