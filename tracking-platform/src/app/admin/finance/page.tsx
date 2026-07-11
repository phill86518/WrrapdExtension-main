import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { listWrapstars } from "@/lib/data";
import { AdminNav } from "@/components/admin-nav";
import {
  createPayoutBatch,
  formatUsdCents,
  getPayoutConfig,
  listEarnings,
  listPayouts,
  markPayoutPaid,
  payoutBatchToCsv,
  savePayoutConfig,
  walletForWrapstar,
} from "@/lib/finance";

export const dynamic = "force-dynamic";

async function createPayoutAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const wrapstarId = String(formData.get("wrapstarId") || "");
  await createPayoutBatch(wrapstarId);
  revalidatePath("/admin/finance");
  redirect("/admin/finance");
}

async function markPaidAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const payoutId = String(formData.get("payoutId") || "");
  const reference = String(formData.get("reference") || "");
  await markPayoutPaid(payoutId, reference);
  revalidatePath("/admin/finance");
}

async function saveRatesAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  await savePayoutConfig({
    basePayCents: Math.round(Number(formData.get("basePayDollars") || 0) * 100),
    peakMultiplier: Number(formData.get("peakMultiplier") || 1.25),
    platformFeeCents: Math.round(Number(formData.get("platformFeeDollars") || 0) * 100),
    tipPassthrough: formData.get("tipPassthrough") === "on",
  });
  revalidatePath("/admin/finance");
  revalidatePath("/admin/finance/rates");
}

function pick(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();

  const sp = await searchParams;
  const focusPayout = pick(sp.payout);

  const [wrapstars, earnings, payouts, config] = await Promise.all([
    listWrapstars(),
    listEarnings(),
    listPayouts(),
    getPayoutConfig(),
  ]);

  const wallets = await Promise.all(
    wrapstars.map(async (w) => ({
      w,
      wallet: await walletForWrapstar(w.id),
    })),
  );

  const unpaidTotal = wallets.reduce((s, x) => s + x.wallet.unpaidCents, 0);
  const paidTotal = wallets.reduce((s, x) => s + x.wallet.paidCents, 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <AdminNav current="/admin/finance" />
      <h1 className="text-2xl font-semibold text-slate-900">Finance & payouts</h1>
      <p className="mt-1 text-sm text-slate-600">
        Uber-style earnings ledger per delivered order. Payouts are batched for ACH export; Stripe Connect can
        plug into the PaymentRail later.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase text-slate-500">Unpaid liability</p>
          <p className="mt-1 text-2xl font-semibold">{formatUsdCents(unpaidTotal)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase text-slate-500">Paid out (lifetime)</p>
          <p className="mt-1 text-2xl font-semibold">{formatUsdCents(paidTotal)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase text-slate-500">Base pay rate</p>
          <p className="mt-1 text-2xl font-semibold">{formatUsdCents(config.basePayCents)}</p>
          <Link href="/admin/finance/rates" className="text-xs text-blue-700 underline">
            Edit rates
          </Link>
        </div>
      </div>

      <section className="mt-8 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-semibold">WrapStar wallets</h2>
        <table className="mt-3 min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1 pr-3">WrapStar</th>
              <th className="py-1 pr-3">Unpaid</th>
              <th className="py-1 pr-3">Paid</th>
              <th className="py-1 pr-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {wallets.map(({ w, wallet }) => (
              <tr key={w.id} className="border-t border-slate-100">
                <td className="py-2 pr-3">
                  <Link href={`/admin/wrapstars/${w.id}`} className="text-blue-700 underline">
                    {w.name}
                  </Link>
                  <div className="font-mono text-[10px] text-slate-500">{w.id}</div>
                </td>
                <td className="py-2 pr-3">{formatUsdCents(wallet.unpaidCents)}</td>
                <td className="py-2 pr-3">{formatUsdCents(wallet.paidCents)}</td>
                <td className="py-2 pr-3">
                  <form action={createPayoutAction}>
                    <input type="hidden" name="wrapstarId" value={w.id} />
                    <button
                      type="submit"
                      disabled={wallet.unpaidCount === 0}
                      className="text-xs text-emerald-700 underline disabled:text-slate-400"
                    >
                      Create payout
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-8 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Payout batches</h2>
        <ul className="mt-3 space-y-4">
          {payouts.length === 0 ? (
            <li className="text-sm text-slate-500">No payout batches yet.</li>
          ) : (
            payouts.map((p) => {
              const related = earnings.filter((e) => p.earningIds.includes(e.id));
              const csv = payoutBatchToCsv(p, related);
              const highlight = focusPayout === p.id;
              return (
                <li
                  key={p.id}
                  id={p.id}
                  className={`rounded-lg border p-3 ${highlight ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs">{p.id}</p>
                      <p className="font-medium">
                        {p.wrapstarName} · {formatUsdCents(p.netCents)} · {p.status}
                      </p>
                      <p className="text-xs text-slate-500">
                        Created {p.createdAt.slice(0, 10)}
                        {p.paidAt ? ` · paid ${p.paidAt.slice(0, 10)}` : ""}
                        {p.reference ? ` · ref ${p.reference}` : ""}
                        {" · "}
                        {p.method}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        className="rounded border px-2 py-1 text-xs"
                        href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
                        download={`${p.id}.csv`}
                      >
                        Download ACH CSV
                      </a>
                      {p.status !== "paid" ? (
                        <form action={markPaidAction} className="flex gap-2">
                          <input type="hidden" name="payoutId" value={p.id} />
                          <input
                            name="reference"
                            placeholder="ACH / bank ref"
                            className="rounded border px-2 py-1 text-xs"
                          />
                          <button type="submit" className="rounded bg-emerald-700 px-2 py-1 text-xs text-white">
                            Mark paid
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </section>

      <section className="mt-8 overflow-x-auto rounded-xl border bg-white shadow-sm">
        <div className="border-b px-4 py-3 font-semibold">Earnings ledger ({earnings.length})</div>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">WrapStar</th>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Base</th>
              <th className="px-3 py-2">Net</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {earnings
              .slice()
              .sort((a, b) => b.earnedAt.localeCompare(a.earnedAt))
              .map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-xs">{e.earnedAt.slice(0, 10)}</td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/wrapstars/${e.wrapstarId}`} className="text-blue-700 underline">
                      {e.wrapstarName}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/orders/${e.orderId}`} className="text-blue-700 underline">
                      {e.orderId}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{formatUsdCents(e.basePayCents)}</td>
                  <td className="px-3 py-2">{formatUsdCents(e.netCents)}</td>
                  <td className="px-3 py-2">{e.status}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      {/* rates form also embedded for convenience */}
      <section className="mt-8 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Quick rate edit</h2>
        <form action={saveRatesAction} className="mt-3 grid gap-3 md:grid-cols-4">
          <label className="text-sm">
            Base pay ($)
            <input
              name="basePayDollars"
              type="number"
              step="0.01"
              defaultValue={(config.basePayCents / 100).toFixed(2)}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Peak multiplier
            <input
              name="peakMultiplier"
              type="number"
              step="0.01"
              defaultValue={config.peakMultiplier}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Platform fee ($)
            <input
              name="platformFeeDollars"
              type="number"
              step="0.01"
              defaultValue={(config.platformFeeCents / 100).toFixed(2)}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </label>
          <label className="flex items-end gap-2 text-sm">
            <input name="tipPassthrough" type="checkbox" defaultChecked={config.tipPassthrough} />
            Tip passthrough
          </label>
          <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm text-white md:col-span-4 md:w-fit">
            Save rates
          </button>
        </form>
      </section>
    </main>
  );
}
