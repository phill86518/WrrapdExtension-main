import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { listAllOrders } from "@/lib/data";
import type { Order } from "@/lib/types";
import { etTime, listBuyPurchases, usd, ymdLabel, type BuyPurchase } from "@/lib/buy-for-you-admin";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<BuyPurchase["status"], string> = {
  to_place: "Paid — to place",
  placed: "Placed",
  cancelled: "Cancelled",
  returned: "Returned",
};

const STATUS_CLASS: Record<BuyPurchase["status"], string> = {
  to_place: "bg-amber-100 text-amber-800",
  placed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-200 text-slate-700",
  returned: "bg-rose-100 text-rose-800",
};

function pick(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] || "" : "";
}

function matches(p: BuyPurchase, q: string): boolean {
  if (!q) return true;
  const g = p.giftee;
  const hay = [
    p.title,
    p.brand,
    p.retailerName,
    p.amazonCategory?.path,
    p.gifter.name,
    p.gifter.email,
    g?.name,
    g?.city,
    g?.postalCode,
    p.batchId,
    p.retailerOrderNumber,
    p.externalOrderId,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

function Dates({ p, order }: { p: BuyPurchase; order?: Order }) {
  const rows: Array<[string, string]> = [
    ["Ordered", etTime(p.dates.created)],
    ["Paid", etTime(p.dates.paid)],
    ["Placed", etTime(p.dates.placed)],
    ["Hub arrival", ymdLabel(p.dates.hubArrival)],
    ["Delivery", ymdLabel(p.dates.delivery)],
    ["Delivered", order?.deliveredAt ? etTime(order.deliveredAt) : "—"],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500">{k}</dt>
          <dd className="text-[#0f172a]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function BuyPurchasesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdminSession();
  if (!session) redirect("/admin?next=/admin/buy-for-you/purchases");
  const sp = searchParams ? await searchParams : {};
  const q = pick(sp.q).trim();
  const dept = pick(sp.dept);
  const status = pick(sp.status);

  let items: BuyPurchase[] = [];
  let departments: string[] = [];
  let loadError = "";
  try {
    const r = await listBuyPurchases();
    items = r.items;
    departments = Object.keys(r.categories);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not reach the pay server";
  }
  const orders = items.some((p) => p.externalOrderId) ? await listAllOrders().catch(() => [] as Order[]) : [];
  const orderFor = (ext: string) => (ext ? orders.find((o) => o.externalOrderId === ext) : undefined);

  const shown = items.filter(
    (p) => matches(p, q) && (!dept || p.amazonCategory?.department === dept) && (!status || p.status === status),
  );
  const totalCents = shown.filter((p) => p.status !== "cancelled").reduce((s, p) => s + p.itemPriceCents, 0);
  const byDept = new Map<string, number>();
  for (const p of shown) {
    const d = p.amazonCategory?.department || "Not categorized";
    byDept.set(d, (byDept.get(d) || 0) + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-blue-800 underline">
            ← Command Center
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-[#0f172a]">Items we purchased</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Every item Wrrapd bought for a wrrapd.com website order: the Amazon category, who paid (gifter), who receives it
            (giftee name and address), and each date from payment to delivery.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/admin/buy-for-you" className="rounded-lg border border-[#1a2744]/40 bg-white px-3 py-2 font-semibold">
            Website order queue
          </Link>
          <Link href="/admin/buy-for-you/settings" className="rounded-lg border border-[#1a2744]/40 bg-white px-3 py-2 font-semibold">
            Settings
          </Link>
        </div>
      </div>

      {loadError ? <p className="font-semibold text-rose-700">{loadError}</p> : null}

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-[#1a2744]/20 bg-white p-4 text-sm" method="get">
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-[#1a2744]">Search</span>
          <input name="q" defaultValue={q} placeholder="Item, gifter, giftee, ZIP, order #" className="w-72 rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-[#1a2744]">Amazon category</span>
          <select name="dept" defaultValue={dept} className="rounded-lg border border-slate-300 px-3 py-2">
            <option value="">All</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-[#1a2744]">Status</span>
          <select name="status" defaultValue={status} className="rounded-lg border border-slate-300 px-3 py-2">
            <option value="">All</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-[#1a2744] px-4 py-2 font-semibold text-white">
          Filter
        </button>
        {q || dept || status ? (
          <Link href="/admin/buy-for-you/purchases" className="py-2 text-blue-800 underline">
            Clear
          </Link>
        ) : null}
      </form>

      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-full bg-[#1a2744] px-3 py-1 font-semibold text-white">
          {shown.length} item(s) · {usd(totalCents)} item prices
        </span>
        {[...byDept.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([d, n]) => (
            <span key={d} className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              {d}: {n}
            </span>
          ))}
      </div>

      {shown.length === 0 && !loadError ? (
        <p className="text-sm text-slate-500">No purchased items yet. Items appear here once the shopper pays.</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[#1a2744]/20 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-[#1a2744]">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Amazon category</th>
              <th className="px-3 py-2">Gifter</th>
              <th className="px-3 py-2">Giftee</th>
              <th className="px-3 py-2">Dates</th>
              <th className="px-3 py-2">Orders</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {shown.map((p) => {
              const o = orderFor(p.externalOrderId);
              const g = p.giftee;
              return (
                <tr key={`${p.batchId}-${p.lineId}`}>
                  <td className="max-w-xs px-3 py-3">
                    <div className="flex gap-3">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" className="h-14 w-14 flex-none rounded-lg border border-slate-200 object-contain" />
                      ) : null}
                      <div className="min-w-0">
                        <a href={p.productUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#0f172a] hover:underline">
                          {p.title}
                        </a>
                        {p.variant ? <p className="text-xs text-slate-600">{p.variant}</p> : null}
                        <p className="text-xs text-slate-600">
                          {p.retailerName}
                          {p.brand ? ` · ${p.brand}` : ""}
                        </p>
                        <p className="mt-1 text-xs">
                          <b>{usd(p.itemPriceCents)}</b>
                          {p.shippingLabel ? ` · ${p.shippingLabel}` : ""}
                          {p.wrapCents != null ? ` · wrap ${usd(p.wrapCents)}` : ""}
                        </p>
                        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[p.status]}`}>
                          {STATUS_LABEL[p.status]}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {p.amazonCategory ? (
                      <>
                        <p className="font-semibold text-[#0f172a]">{p.amazonCategory.department}</p>
                        {p.amazonCategory.subcategory ? <p className="text-xs text-slate-600">{p.amazonCategory.subcategory}</p> : null}
                        <p className="mt-1 text-[11px] text-slate-500">
                          {p.amazonCategory.source === "amazon_page" ? "From the Amazon page" : "Mapped by AI"}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-slate-500">{p.retailerCategory || "Not categorized"}</p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <p className="text-sm font-semibold text-[#0f172a]">{p.gifter.name || "—"}</p>
                    <p>{p.gifter.email}</p>
                    <p>{p.gifter.phone}</p>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {g ? (
                      <>
                        <p className="text-sm font-semibold text-[#0f172a]">{g.name}</p>
                        <p>{g.line1}</p>
                        {g.line2 ? <p>{g.line2}</p> : null}
                        <p>
                          {g.city}, {g.state} {g.postalCode}
                        </p>
                        {g.phone ? <p>{g.phone}</p> : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Dates p={p} order={o} />
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <Link href={`/admin/buy-for-you/${p.batchId}`} className="font-semibold text-blue-800 underline">
                      {p.batchId}
                    </Link>
                    {p.retailerOrderNumber ? (
                      <p className="mt-1">
                        {p.retailerName} #{p.retailerOrderNumber}
                      </p>
                    ) : null}
                    {o ? (
                      <p className="mt-1">
                        <Link href={`/admin/orders/${o.id}`} className="text-blue-800 underline">
                          {p.externalOrderId}
                        </Link>{" "}
                        · {o.status}
                      </p>
                    ) : p.externalOrderId ? (
                      <p className="mt-1 text-slate-600">
                        {p.externalOrderId}
                        {p.sentToOrders ? "" : " (not in Orders yet)"}
                      </p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
