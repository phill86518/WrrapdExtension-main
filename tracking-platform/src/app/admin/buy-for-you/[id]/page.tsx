import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { listAllOrders } from "@/lib/data";
import type { Order } from "@/lib/types";
import {
  etTime,
  getBuyBatch,
  isPast,
  usd,
  type Bill,
  type BuyBatch,
  type BuyGroup,
  type BuyLine,
  type RunnerStatus,
} from "@/lib/buy-for-you-admin";
import {
  cancelGroupAction,
  placedAction,
  quoteAction,
  retryIngestAction,
  returnRefundAction,
  returnRequestAction,
  unavailableAction,
} from "../actions";

export const dynamic = "force-dynamic";

const input = "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm";
const btn = "rounded-lg bg-[#1a2744] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f172a]";
const btnWarn = "rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800";
const card = "rounded-2xl border border-[#1a2744]/25 bg-white p-5 shadow-sm";

function dollars(cents: number | null | undefined) {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

function Hidden({ batchId, retailer }: { batchId: string; retailer?: string }) {
  return (
    <>
      <input type="hidden" name="batchId" value={batchId} />
      {retailer ? <input type="hidden" name="retailer" value={retailer} /> : null}
    </>
  );
}

function ItemRow({ line, priceCents }: { line: BuyLine; priceCents?: number | null }) {
  const w = line.wrap;
  return (
    <div className="flex gap-3 border-t border-slate-100 py-3 first:border-t-0">
      {line.product?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={line.product.imageUrl} alt="" className="h-16 w-16 flex-none rounded-lg bg-slate-50 object-contain" />
      ) : (
        <div className="h-16 w-16 flex-none rounded-lg bg-slate-100" />
      )}
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-[#0f172a]">
          {line.id} · {line.product?.title || "(not read yet)"}
          {line.variantLabel ? <span className="font-normal text-slate-600"> · {line.variantLabel}</span> : null}
        </p>
        <p className="truncate">
          <a href={line.canonicalUrl || line.url} target="_blank" rel="noreferrer" className="text-blue-800 underline">
            {line.canonicalUrl || line.url}
          </a>
        </p>
        <p className="text-slate-600">
          {line.removed ? "Removed by shopper" : line.cancelled ? "Cancelled" : line.state}
          {line.reason ? ` (${line.reason})` : ""}
          {line.readFailure ? ` · read: ${line.readFailure}` : ""}
          {line.product?.isElectronics ? " · electronics" : ""}
          {line.product?.category ? ` · ${line.product.category}` : ""}
        </p>
        {w ? (
          <p className="text-slate-600">
            Wrap: {w.style === "ai" ? `AI design “${w.aiDesign?.title || ""}”` : w.style === "upload" ? "Uploaded design" : "Wrrapd paper"}
            {w.occasion ? ` · ${w.occasion}` : ""}
            {w.flowers ? ` · flowers (${w.flowers.title})` : ""}
            {w.giftMessage ? ` · “${w.giftMessage}”` : ""}
            {w.senderName ? ` — ${w.senderName}` : ""}
            {!w.done ? " · not finished" : ""}
          </p>
        ) : null}
      </div>
      {priceCents != null ? <p className="text-sm font-bold text-[#0f172a]">{usd(priceCents)}</p> : null}
    </div>
  );
}

function QuoteForm({ batch, group, lines }: { batch: BuyBatch; group: BuyGroup; lines: BuyLine[] }) {
  const q = group.quote || group.previousQuote || null;
  const ship = q?.shippingOptions || [];
  return (
    <form action={quoteAction} className="mt-4 space-y-4 rounded-xl border border-amber-300 bg-amber-50/60 p-4">
      <Hidden batchId={batch.id} retailer={group.retailer} />
      <input type="hidden" name="lineIds" value={lines.map((l) => l.id).join(",")} />
      <p className="text-sm font-semibold text-[#0f172a]">
        Desk quote — ship to {batch.hub.displayName}, {batch.hub.addressLine1}, {batch.hub.city} {batch.hub.state} {batch.hub.postalCode}.
        Read the final cost page, then back out without paying.
      </p>
      {lines.map((l) => (
        <div key={l.id} className="grid gap-2 rounded-lg bg-white p-3 sm:grid-cols-6">
          <label className="text-xs sm:col-span-3">
            Title ({l.id})
            <input name={`title_${l.id}`} defaultValue={l.product?.title || ""} className={input} />
          </label>
          <label className="text-xs">
            Item price $
            <input name={`price_${l.id}`} defaultValue={dollars(q?.itemPrices?.[l.id] ?? l.product?.pagePriceCents)} className={input} inputMode="decimal" />
          </label>
          <label className="text-xs sm:col-span-2">
            Size / color
            <input name={`variantLabel_${l.id}`} defaultValue={l.variantLabel || ""} className={input} />
          </label>
          <label className="text-xs sm:col-span-3">
            Image URL (https)
            <input name={`imageUrl_${l.id}`} defaultValue={l.product?.imageUrl || ""} className={input} />
          </label>
          <label className="text-xs sm:col-span-2">
            Category
            <input name={`category_${l.id}`} defaultValue={l.product?.category || ""} className={input} />
          </label>
          <div className="flex flex-col justify-end gap-1 text-xs">
            <label className="flex items-center gap-1">
              <input type="checkbox" name={`elec_${l.id}`} defaultChecked={!!l.product?.isElectronics} /> Electronics
            </label>
            <label className="flex items-center gap-1 text-rose-700">
              <input type="checkbox" name={`drop_${l.id}`} /> Can&apos;t buy
            </label>
          </div>
        </div>
      ))}
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Shipping options at checkout (pass-through)</p>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-4">
            <input name={`shipLabel_${i}`} placeholder={i === 0 ? "Standard (free)" : "Option label"} defaultValue={ship[i]?.label || ""} className={input} />
            <input name={`shipCost_${i}`} placeholder="Cost $ (0 = free)" defaultValue={dollars(ship[i]?.cents)} className={input} inputMode="decimal" />
            <input type="date" name={`shipArrival_${i}`} defaultValue={ship[i]?.arrivalDate || ""} className={input} title="Arrives at hub" />
            <input name={`shipTax_${i}`} placeholder="Tax $ with this option" defaultValue={dollars(ship[i]?.taxCents)} className={input} inputMode="decimal" />
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs">
          Retailer tax $ (if same for every option)
          <input name="taxCents" defaultValue={dollars(q?.taxCents)} className={input} inputMode="decimal" />
        </label>
        <label className="text-xs">
          Cost-page total $ (cheapest option)
          <input name="retailerTotal" defaultValue={dollars(q?.retailerTotalCents)} className={input} inputMode="decimal" />
        </label>
        <label className="text-xs">
          Note
          <input name="note" defaultValue={q?.note || ""} className={input} />
        </label>
      </div>
      <button className={btn}>Send quote to shopper</button>
    </form>
  );
}

function GroupCard({
  batch,
  group,
  runner,
  bill,
}: {
  batch: BuyBatch;
  group: BuyGroup;
  runner?: RunnerStatus;
  bill: Bill | null;
}) {
  const lines = batch.lines.filter((l) => l.retailer === group.retailer);
  const active = lines.filter((l) => !l.removed && l.state !== "unavailable" && l.product);
  const paidGroup = batch.paidBill?.groups.find((g) => g.retailer === group.retailer);
  const billGroup = (batch.paidBill || bill)?.groups.find((g) => g.retailer === group.retailer);
  const placement = batch.placements?.[group.retailer];
  const placeState = group.placement?.state;
  const canQuote = batch.status === "open" && active.length > 0 && group.state !== "unavailable" && group.state !== "empty";
  const overdue = group.deadlineAt && isPast(group.deadlineAt);

  return (
    <section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-[#0f172a]">{group.retailerName}</h2>
          <p className="text-sm text-slate-600">
            {placeState ? `Order: ${placeState}` : `Quote: ${group.state}${group.kind === "booking" ? " (booking refresh)" : ""}`}
            {group.deadlineAt && group.state === "needs_person" ? (
              <span className={overdue ? " font-bold text-rose-700" : " text-amber-800"}> · due {etTime(group.deadlineAt)}</span>
            ) : null}
            {group.quote ? ` · last quote ${etTime(group.quote.at)} by ${group.quote.by} (${group.quote.source})` : ""}
          </p>
          <p className="text-xs text-slate-500">
            Robot: {runner?.ready ? "ready" : runner ? `off (${runner.playwright ? "browser ok" : "no browser"}, ${runner.signedInProfile ? "signed in" : "no signed-in profile"})` : "—"}
            {group.runner ? ` · last run ${group.runner.ok ? "ok" : `failed at step ${group.runner.failedStep ?? "?"}: ${group.runner.reason}`}` : ""}
          </p>
        </div>
        {billGroup ? (
          <div className="text-right text-sm">
            <p>
              Ship: {billGroup.shipping.label} {usd(billGroup.shipping.cents)}
              {billGroup.shipping.arrivalDate ? ` · hub ${billGroup.shipping.arrivalDate}` : ""}
            </p>
            <p>Tax {usd(billGroup.taxCents)}</p>
            <p className="font-bold">
              {batch.paidBill ? "Paid" : "Bill"} for {group.retailerName}: {usd(billGroup.subtotalCents)}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-3">
        {lines.map((l) => (
          <ItemRow key={l.id} line={l} priceCents={billGroup?.items.find((i) => i.lineId === l.id)?.cents ?? group.quote?.itemPrices?.[l.id]} />
        ))}
      </div>

      {canQuote ? (
        <>
          <QuoteForm batch={batch} group={group} lines={active} />
          <form action={unavailableAction} className="mt-3 flex flex-wrap items-end gap-2">
            <Hidden batchId={batch.id} retailer={group.retailer} />
            <label className="text-xs">
              Reason (internal)
              <input name="reason" placeholder="out of stock, won't ship to hub…" className={input} />
            </label>
            <button className={btnWarn}>We can&apos;t buy anything from {group.retailerName}</button>
          </form>
        </>
      ) : null}

      {paidGroup && placeState === "to_place" ? (
        <form action={placedAction} className="mt-4 grid gap-2 rounded-xl border border-emerald-300 bg-emerald-50/60 p-4 sm:grid-cols-4">
          <Hidden batchId={batch.id} retailer={group.retailer} />
          <p className="text-sm font-semibold text-[#0f172a] sm:col-span-4">
            Buy at {group.retailerName} with &ldquo;{paidGroup.shipping.label}&rdquo; to {batch.hub.addressLine1}, {batch.hub.postalCode}. Do not
            pay more than {usd(paidGroup.subtotalCents)}.
          </p>
          <label className="text-xs">
            Retailer order #
            <input name="retailerOrderNumber" required className={input} />
          </label>
          <label className="text-xs">
            Retailer total $
            <input name="retailerTotal" required className={input} inputMode="decimal" />
          </label>
          <label className="text-xs">
            Arrives at hub
            <input type="date" name="arrivalDate" required defaultValue={paidGroup.shipping.arrivalDate || ""} className={input} />
          </label>
          <div className="flex items-end">
            <button className={btn}>Record & send to Orders</button>
          </div>
        </form>
      ) : null}

      {placement ? (
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
          {group.retailerName} order <b>#{placement.retailerOrderNumber}</b> · {usd(placement.retailerTotalCents)} · hub {placement.arrivalDate} ·
          placed {etTime(placement.placedAt)} by {placement.by}
        </p>
      ) : null}

      {paidGroup && placeState !== "cancelled" ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-rose-800">Cancel this retailer group and refund</summary>
          <form action={cancelGroupAction} className="mt-2 space-y-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3">
            <Hidden batchId={batch.id} retailer={group.retailer} />
            <input type="hidden" name="requestId" value={`${batch.id}-${group.retailer}-cancel-${randomUUID().slice(0, 8)}`} />
            {placeState === "placed" ? (
              <label className="flex items-center gap-2">
                <input type="checkbox" name="retailerCancelled" /> The retailer cancelled and refunded Wrrapd
              </label>
            ) : null}
            <label className="flex items-center gap-2">
              <input type="checkbox" name="wrapDocumented" /> Wrapping work already started (keep wrap fees)
            </label>
            <input name="reason" placeholder="Reason" className={input} />
            <input name="confirm" placeholder="Type REFUND" className={input} />
            <button className={btnWarn}>Cancel & refund</button>
          </form>
        </details>
      ) : null}
    </section>
  );
}

function BillCard({ bill, title }: { bill: Bill; title: string }) {
  const w = bill.wrap;
  return (
    <section className={card}>
      <h2 className="text-lg font-bold text-[#0f172a]">{title}</h2>
      <div className="mt-2 grid gap-1 text-sm">
        <p>Items {usd(bill.merchandiseCents)} · retailer shipping + tax → retailer total {usd(bill.retailerCents)}</p>
        <p>
          Gift wrap {usd(w.giftWrapCents)} ({w.giftWrapCount})
          {w.discountCents ? ` · discount −${usd(w.discountCents)}` : ""}
          {w.designAiCents ? ` · AI design ${usd(w.designAiCents)}` : ""}
          {w.designUploadCents ? ` · upload ${usd(w.designUploadCents)}` : ""}
          {w.flowersCents ? ` · flowers ${usd(w.flowersCents)}` : ""}
          {w.boxCents ? ` · box ${usd(w.boxCents)}` : ""} · tax {usd(w.serviceTaxCents)} → {usd(w.totalCents)}
        </p>
        <p className="font-bold">Total {usd(bill.totalCents)}</p>
        {bill.bundles.map((b) => (
          <p key={b.arrivalDate || "tbd"} className="text-slate-600">
            Hub {b.arrivalDate || "date TBD"} → deliver {b.deliveryDate || "TBD"}: {b.titles.join(", ")}
          </p>
        ))}
      </div>
    </section>
  );
}

export default async function BuyBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const session = await requireAdminSession();
  if (!session) redirect(`/admin?next=/admin/buy-for-you/${id}`);
  const sp = searchParams ? await searchParams : {};
  const msg = typeof sp.msg === "string" ? sp.msg : "";
  const err = typeof sp.err === "string" ? sp.err : "";

  let data: Awaited<ReturnType<typeof getBuyBatch>> | null = null;
  let loadError = "";
  try {
    data = await getBuyBatch(id);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load";
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <Link href="/admin/buy-for-you" className="text-sm text-blue-800 underline">
          ← We buy it
        </Link>
        <p className="font-semibold text-rose-700">{loadError}</p>
      </div>
    );
  }
  const { batch, bill, billError, runner, termsVersion } = data;

  let trackingOrders: Order[] = [];
  if (Object.keys(batch.bundles || {}).length) {
    const all = await listAllOrders().catch(() => [] as Order[]);
    trackingOrders = all.filter((o) => o.externalOrderId?.startsWith(`${batch.id}-`));
  }
  const orderFor = (ext: string) => trackingOrders.find((o) => o.externalOrderId === ext);
  const bundleForLine = (lineId: string) => Object.values(batch.bundles || {}).find((b) => b.lineIds.includes(lineId));
  const placedLines = batch.lines.filter((l) => batch.placements?.[l.retailer] && !l.cancelled && !l.removed && l.state === "ready");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/buy-for-you" className="text-sm text-blue-800 underline">
          ← We buy it
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-[#0f172a]">
          {batch.id} <span className="text-base font-semibold uppercase text-slate-500">{batch.status}</span>
        </h1>
        <p className="text-sm text-slate-600">
          Created {etTime(batch.createdAt)} · giftee ZIP {batch.gifteeZip} · hub {batch.hub.displayName}, {batch.hub.addressLine1}
          {batch.hub.addressLine2 ? `, ${batch.hub.addressLine2}` : ""}, {batch.hub.city} {batch.hub.state} {batch.hub.postalCode}
        </p>
        {batch.refresh ? (
          <p className="text-sm text-slate-600">
            Booking refresh {batch.refresh.state} (started {etTime(batch.refresh.startedAt)})
            {batch.refresh.changes?.length ? ` · ${batch.refresh.changes.map((c) => c.text).join(" ")}` : ""}
          </p>
        ) : null}
      </div>
      {msg ? <p className="rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-800">{msg}</p> : null}
      {err ? <p className="rounded-lg bg-rose-50 p-3 font-semibold text-rose-800">{err}</p> : null}
      {billError ? <p className="text-sm font-semibold text-amber-800">Bill: {billError}</p> : null}

      {Object.values(batch.groups || {}).map((g) => (
        <GroupCard key={g.retailer} batch={batch} group={g} runner={runner[g.retailer]} bill={bill} />
      ))}

      {batch.paidBill ? <BillCard bill={batch.paidBill} title="Paid bill" /> : bill ? <BillCard bill={bill} title="Current bill (not paid)" /> : null}

      {batch.payment ? (
        <section className={card}>
          <h2 className="text-lg font-bold text-[#0f172a]">Payment</h2>
          <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            <p>
              {batch.payment.gifterName} · {batch.payment.email} · {batch.payment.phone}
            </p>
            <p>
              Paid {usd(batch.payment.amountCents)} on {etTime(batch.payment.paidAt)} · Helcim {batch.payment.transactionId}
            </p>
            <p>
              Giftee: {batch.payment.giftee.name}, {batch.payment.giftee.line1}
              {batch.payment.giftee.line2 ? `, ${batch.payment.giftee.line2}` : ""}, {batch.payment.giftee.city} {batch.payment.giftee.state}{" "}
              {batch.payment.giftee.postalCode}
            </p>
            <p>Refunded {usd(batch.refundedCents)}</p>
          </div>
        </section>
      ) : null}

      {Object.keys(batch.bundles || {}).length ? (
        <section className={card}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#0f172a]">Deliveries in Orders</h2>
            <form action={retryIngestAction}>
              <Hidden batchId={batch.id} />
              <button className={btn}>Resend to Orders</button>
            </form>
          </div>
          <div className="mt-2 space-y-1 text-sm">
            {Object.values(batch.bundles).map((b) => {
              const o = orderFor(b.externalOrderId);
              return (
                <p key={b.key}>
                  <b>{b.externalOrderId}</b> · hub {b.arrivalDate || "TBD"} · {b.lineIds.join(", ")} ·{" "}
                  {b.ingest?.ok ? "in Orders" : <span className="text-rose-700">not sent ({b.ingest?.reason})</span>}
                  {o ? (
                    <>
                      {" "}
                      ·{" "}
                      <Link href={`/admin/orders/${o.id}`} className="text-blue-800 underline">
                        {o.status}
                        {o.deliveredAt ? ` ${etTime(o.deliveredAt)}` : ""}
                      </Link>
                    </>
                  ) : null}
                </p>
              );
            })}
          </div>
        </section>
      ) : null}

      {placedLines.length ? (
        <section className={card}>
          <h2 className="text-lg font-bold text-[#0f172a]">Returns ({batch.returnWindowDays}-day window from delivery)</h2>
          <div className="mt-2 space-y-4">
            {placedLines.map((l) => {
              const bundle = bundleForLine(l.id);
              const o = bundle ? orderFor(bundle.externalOrderId) : undefined;
              const r = batch.returns?.[l.id];
              return (
                <div key={l.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <p className="font-semibold">
                    {l.id} · {l.product?.title} · {o?.deliveredAt ? `delivered ${etTime(o.deliveredAt)}` : "not delivered yet"}
                  </p>
                  {r?.requests.map((q) => (
                    <p key={q.at} className="text-slate-600">
                      Request {etTime(q.at)} by {q.caller || "?"} ({q.condition || "condition not noted"}) · window ends {etTime(q.deadline)}
                    </p>
                  ))}
                  {r?.refunded ? (
                    <p className="font-semibold text-emerald-800">
                      Refunded {usd(r.refunded.amountCents)} on {etTime(r.refunded.at)} by {r.refunded.by}
                    </p>
                  ) : o?.deliveredAt ? (
                    <div className="mt-2 grid gap-3 lg:grid-cols-2">
                      <form action={returnRequestAction} className="space-y-1">
                        <Hidden batchId={batch.id} />
                        <input type="hidden" name="lineId" value={l.id} />
                        <input type="hidden" name="deliveredAt" value={o.deliveredAt} />
                        <input name="caller" placeholder="Who asked (name / phone)" className={input} />
                        <input name="condition" placeholder="Condition (unopened, opened…)" className={input} />
                        <input name="note" placeholder="Note" className={input} />
                        <button className={btn}>Log return request</button>
                      </form>
                      {r?.requests.length ? (
                        <form action={returnRefundAction} className="space-y-1">
                          <Hidden batchId={batch.id} />
                          <input type="hidden" name="lineId" value={l.id} />
                          <input type="hidden" name="requestId" value={`${batch.id}-${l.id}-return-${randomUUID().slice(0, 8)}`} />
                          <label className="flex items-center gap-2">
                            <input type="checkbox" name="notNonReturnable" /> Not a non-returnable category
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" name="retailerAccepted" /> Retailer accepted the return
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" name="backResalable" /> Back with us, resalable
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" name="retailerRefundedShipping" /> Retailer refunded shipping too
                          </label>
                          <input name="reason" placeholder="Reason" className={input} />
                          <button className={btnWarn}>Refund item + its tax</button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {batch.refunds?.length ? (
        <section className={card}>
          <h2 className="text-lg font-bold text-[#0f172a]">Refunds</h2>
          <div className="mt-2 space-y-1 text-sm">
            {batch.refunds.map((r) => (
              <p key={r.id} className={r.ok ? "" : "text-rose-700"}>
                {etTime(r.at)} · {r.kind} · {usd(r.amountCents)} · {r.ok ? "done" : `failed: ${r.error}`} · {r.by}
                {r.reason ? ` · ${r.reason}` : ""}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      <section className={card}>
        <h2 className="text-lg font-bold text-[#0f172a]">Purchasing terms</h2>
        {batch.terms ? (
          <p className="mt-1 text-sm">
            {batch.terms.version} accepted {etTime(batch.terms.acceptedAt)} from {batch.terms.ip}
            {batch.terms.email ? ` · ${batch.terms.email}` : ""}
            {batch.terms.electronicsRequired ? ` · electronics sentence ${batch.terms.electronicsAccepted ? "accepted" : "missing"}` : ""}
            {batch.terms.version !== termsVersion ? ` (current version is ${termsVersion})` : ""}
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">Not accepted yet.</p>
        )}
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold text-[#0f172a]">Log</h2>
        <div className="mt-2 max-h-96 space-y-1 overflow-y-auto text-xs text-slate-700">
          {[...(batch.log || [])].reverse().map((e, i) => (
            <p key={`${e.at}-${i}`}>
              {etTime(e.at)} · {e.who} · {e.what}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
