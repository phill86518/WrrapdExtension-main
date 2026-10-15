import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { etTime, listManualAdditions, usd, type ManualRow, type ManualState } from "@/lib/buy-for-you-admin";
import { addOnIngestAction, addOnPlacedAction, addOnResendAction, manualAddAction, manualCancelAction } from "../actions";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<ManualState, string> = {
  requested: "To add",
  read_ok: "Shopper pasted it again and it read",
  in_cart: "In the open cart",
  paid_with_order: "Paid with the order — place it",
  awaiting_approval: "Waiting for the shopper to approve",
  paid: "Approved and paid — place it",
  placed: "Done — added manually",
  declined: "Shopper said no",
  cancelled: "Closed",
  removed: "Shopper removed it",
};

const STATE_CLASS: Record<ManualState, string> = {
  requested: "bg-amber-100 text-amber-800",
  read_ok: "bg-slate-200 text-slate-700",
  in_cart: "bg-sky-100 text-sky-800",
  paid_with_order: "bg-amber-100 text-amber-800",
  awaiting_approval: "bg-sky-100 text-sky-800",
  paid: "bg-amber-100 text-amber-800",
  placed: "bg-emerald-100 text-emerald-800",
  declined: "bg-slate-200 text-slate-700",
  cancelled: "bg-slate-200 text-slate-700",
  removed: "bg-slate-200 text-slate-700",
};

const input = "w-full rounded-lg border border-slate-300 px-3 py-2";
const label = "flex flex-col gap-1 text-xs font-semibold text-[#1a2744]";
const primary = "rounded-lg bg-[#1a2744] px-4 py-2 text-sm font-semibold text-white";
const ghost = "rounded-lg border border-[#1a2744]/40 bg-white px-3 py-2 text-sm font-semibold";

function Hidden({ r }: { r: ManualRow }) {
  return (
    <>
      <input type="hidden" name="batchId" value={r.batchId} />
      <input type="hidden" name="lineId" value={r.lineId} />
    </>
  );
}

function Head({ r }: { r: ManualRow }) {
  const title = r.addOn?.item.title || r.product?.title || "";
  const image = r.addOn?.item.imageUrl || r.product?.imageUrl || "";
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-14 w-14 flex-none rounded-lg border border-slate-200 object-contain" />
        ) : null}
        <div className="min-w-0">
          <p className="font-bold text-[#0f172a]">
            {r.retailerName}
            {title ? ` · ${title}` : ""}
          </p>
          <a href={r.url} target="_blank" rel="noreferrer" className="break-all text-xs text-blue-800 underline">
            {r.url}
          </a>
          <p className="mt-1 text-xs text-slate-600">
            Order{" "}
            <Link href={`/admin/buy-for-you/${r.batchId}`} className="font-semibold text-blue-800 underline">
              {r.batchId}
            </Link>{" "}
            ({r.batchStatus}) · {r.email || "no email yet"}
            {r.gifterName ? ` · ${r.gifterName}` : ""} · ZIP {r.gifteeZip} · {r.hub}
          </p>
          <p className="text-xs text-slate-500">
            Asked {etTime(r.requestedAt)} · read failed: {r.reason || "unknown"} ·{" "}
            {r.onlyItem ? "only item in the order" : `${r.otherItems} other item(s)`}
          </p>
        </div>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATE_CLASS[r.state]}`}>{STATE_LABEL[r.state]}</span>
    </div>
  );
}

function AddForm({ r }: { r: ManualRow }) {
  const where =
    r.batchStatus === "paid"
      ? "The order is paid. Adding emails the shopper a button to approve and pay for this item."
      : "The order is not paid yet. Adding puts the item in the shopper's cart and emails them a link to finish.";
  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-[#2d4a38]">{where}</p>
      <form action={manualAddAction} className="grid gap-3 sm:grid-cols-6">
        <Hidden r={r} />
        <label className={`${label} sm:col-span-4`}>
          Title
          <input name="title" required className={input} />
        </label>
        <label className={`${label} sm:col-span-1`}>
          Unit price
          <input name="price" required inputMode="decimal" placeholder="0.00" className={input} />
        </label>
        <label className={`${label} sm:col-span-1`}>
          Qty
          <input name="qty" type="number" min={1} max={10} defaultValue={1} className={input} />
        </label>
        <label className={`${label} sm:col-span-3`}>
          Size, color, or other option
          <input name="variantLabel" placeholder="Size: 8, Color: Black" className={input} />
        </label>
        <label className={`${label} sm:col-span-3`}>
          Image URL (https)
          <input name="imageUrl" type="url" className={input} />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Shipping (blank = standard rate)
          <input name="shipping" inputMode="decimal" placeholder="0.00" className={input} />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Arrives at hub
          <input name="arrivalDate" type="date" className={input} />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Category
          <input name="category" className={input} />
        </label>
        <div className="sm:col-span-6">
          <button type="submit" className={primary}>
            Add item
          </button>
        </div>
      </form>
      <CloseForm r={r} />
    </div>
  );
}

function CloseForm({ r }: { r: ManualRow }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-slate-600">We can&apos;t add it</summary>
      <form action={manualCancelAction} className="mt-2 flex flex-wrap items-end gap-3">
        <Hidden r={r} />
        <label className={label}>
          Note (Command Center only)
          <input name="note" className={`${input} w-72`} />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" name="tellShopper" defaultChecked /> Email the shopper
        </label>
        <button type="submit" className={ghost}>
          Close request
        </button>
      </form>
    </details>
  );
}

function AddOnSummary({ r }: { r: ManualRow }) {
  const a = r.addOn;
  if (!a) return null;
  return (
    <p className="mt-2 text-sm">
      {a.item.variant ? `${a.item.variant} · ` : ""}
      {a.item.qty > 1 ? `${a.item.qty} × ${usd(a.item.unitCents)} · ` : ""}
      Item {usd(a.item.cents)} · shipping {usd(a.shipping.cents)} · tax {usd(a.taxCents)} · gift-wrap {usd(a.wrapBill.totalCents)} (
      {a.wrapStyle}) · <b>total {usd(a.totalCents)}</b>
    </p>
  );
}

function Waiting({ r }: { r: ManualRow }) {
  const a = r.addOn;
  if (r.state === "in_cart") {
    return (
      <p className="mt-2 text-sm text-[#2d4a38]">
        In the shopper&apos;s cart{r.product?.pagePriceCents ? ` at ${usd(r.product.pagePriceCents)}` : ""}. It is paid with the rest of
        the order.{" "}
        <a href={r.cartUrl} target="_blank" rel="noreferrer" className="text-blue-800 underline">
          Shopper&apos;s cart
        </a>
      </p>
    );
  }
  return (
    <div className="mt-2 space-y-2">
      <AddOnSummary r={r} />
      <p className="text-xs text-slate-600">Approval email sent {etTime(a?.approvalSentAt)}.</p>
      <div className="flex flex-wrap items-center gap-3">
        <form action={addOnResendAction}>
          <Hidden r={r} />
          <input type="hidden" name="addOnId" value={a?.id} />
          <button type="submit" className={ghost}>
            Resend approval email
          </button>
        </form>
        <a href={r.approveUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-800 underline">
          Shopper&apos;s approval page
        </a>
      </div>
      <CloseForm r={r} />
    </div>
  );
}

function Place({ r }: { r: ManualRow }) {
  const a = r.addOn;
  if (r.state === "paid_with_order") {
    return (
      <p className="mt-2 text-sm text-[#2d4a38]">
        Paid with the rest of the order. Place it from the{" "}
        <Link href={`/admin/buy-for-you/${r.batchId}`} className="text-blue-800 underline">
          order page
        </Link>
        .
      </p>
    );
  }
  if (!a) return null;
  const placed = a.placement?.state === "placed";
  return (
    <div className="mt-2 space-y-2">
      <AddOnSummary r={r} />
      {placed ? (
        <form action={addOnIngestAction} className="flex flex-wrap items-center gap-3">
          <Hidden r={r} />
          <input type="hidden" name="addOnId" value={a.id} />
          <span className="text-sm text-rose-700">
            {r.retailerName} #{a.placement?.retailerOrderNumber} recorded, but it is not in Orders yet{a.ingest?.reason ? ` (${a.ingest.reason})` : ""}.
          </span>
          <button type="submit" className={ghost}>
            Retry
          </button>
        </form>
      ) : (
        <form action={addOnPlacedAction} className="flex flex-wrap items-end gap-3">
          <Hidden r={r} />
          <input type="hidden" name="addOnId" value={a.id} />
          <p className="w-full text-sm text-[#2d4a38]">
            Buy it with the Wrrapd {r.retailerName} account, shipping to the hub. The retailer total must be {usd(a.totalCents - a.wrapBill.totalCents)} or
            less.
          </p>
          <label className={label}>
            {r.retailerName} order number
            <input name="retailerOrderNumber" required className={input} />
          </label>
          <label className={label}>
            Retailer total
            <input name="retailerTotal" required inputMode="decimal" className={input} />
          </label>
          <label className={label}>
            Arrives at hub
            <input name="arrivalDate" type="date" required className={input} />
          </label>
          <button type="submit" className={primary}>
            Record and send to Orders
          </button>
        </form>
      )}
    </div>
  );
}

function Section({ title, blurb, rows, empty, body }: { title: string; blurb: string; rows: ManualRow[]; empty: string; body?: (r: ManualRow) => ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#1a2744]">
          {title} ({rows.length})
        </h2>
        <p className="mt-1 text-sm text-[#2d4a38]">{blurb}</p>
      </div>
      {rows.length ? (
        rows.map((r) => (
          <div key={`${r.batchId}-${r.lineId}`} className="rounded-xl border border-[#1a2744]/25 bg-white px-4 py-3 shadow-sm">
            <Head r={r} />
            {body ? body(r) : null}
          </div>
        ))
      ) : (
        <p className="text-sm text-slate-500">{empty}</p>
      )}
    </section>
  );
}

export default async function ManualAdditionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdminSession();
  if (!session) redirect("/admin?next=/admin/buy-for-you/manual");
  const sp = searchParams ? await searchParams : {};
  const msg = typeof sp.msg === "string" ? sp.msg : "";
  const err = typeof sp.err === "string" ? sp.err : "";

  let rows: ManualRow[] = [];
  let loadError = "";
  try {
    rows = await listManualAdditions();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not reach the pay server";
  }
  const toAdd = rows.filter((r) => r.state === "requested");
  const waiting = rows.filter((r) => r.state === "awaiting_approval" || r.state === "in_cart");
  const place = rows.filter((r) => r.state === "paid" || r.state === "paid_with_order");
  const done = rows.filter((r) => !["requested", "awaiting_approval", "in_cart", "paid", "paid_with_order"].includes(r.state));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-blue-800 underline">
            ← Command Center
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-[#0f172a]">Manual additions</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Items a shopper asked Wrrapd to add by hand after we could not read the store page. Open the link, enter what the
            page shows, and add it. A paid order gets an approval email with a pay button; an unpaid order gets the item in its
            cart.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/admin/buy-for-you" className={ghost}>
            Website order queue
          </Link>
          <Link href="/admin/buy-for-you/purchases" className={ghost}>
            Items we purchased
          </Link>
        </div>
      </div>

      {msg ? <p className="rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-800">{msg}</p> : null}
      {err ? <p className="rounded-lg bg-rose-50 p-3 font-semibold text-rose-800">{err}</p> : null}
      {loadError ? <p className="font-semibold text-rose-700">{loadError}</p> : null}

      <Section
        title="To add"
        blurb="Open the link, pick the option the shopper wanted, and enter the price the page shows."
        rows={toAdd}
        empty="No requests waiting."
        body={(r) => <AddForm r={r} />}
      />
      <Section
        title="Waiting for the shopper"
        blurb="The item is in the open cart, or the approval email is out."
        rows={waiting}
        empty="Nothing waiting."
        body={(r) => <Waiting r={r} />}
      />
      <Section
        title="Paid — place at the retailer"
        blurb="Buy it shipping to the hub, then record the retailer order to send it to Orders."
        rows={place}
        empty="Nothing to place."
        body={(r) => <Place r={r} />}
      />
      <Section
        title="Done and closed"
        blurb="Added manually and sent to Orders, declined, or closed."
        rows={done}
        empty="Nothing yet."
        body={(r) => (r.addOn ? <AddOnSummary r={r} /> : r.note ? <p className="mt-2 text-sm text-slate-600">{r.note}</p> : null)}
      />
    </div>
  );
}
