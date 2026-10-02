import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { listWrapstars } from "@/lib/data";
import {
  createPayoutBatch,
  formatUsdCents,
  getPayoutConfig,
  savePayoutConfig,
  listEarnings,
  listPayoutHolds,
  listPayouts,
  markPayoutPaid,
  payoutBatchToCsv,
  walletForWrapstar,
} from "@/lib/finance";
import { setPayoutHoldAction } from "../payout-hold-action";
import { previewWeeklyPay, runWeeklyPayouts } from "@/lib/weekly-pay";
import { getPlatformPayoutBank, stripeKeyMode } from "@/lib/stripe-connect";

export const dynamic = "force-dynamic";

async function createPayoutAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const wrapstarId = String(formData.get("wrapstarId") || "");
  const result = await createPayoutBatch(wrapstarId);
  revalidatePath("/admin/finance");
  if (!result.ok) {
    redirect(`/admin/finance?payoutError=${encodeURIComponent(result.error)}`);
  }
  redirect("/admin/finance");
}

async function runWeeklyPayoutsAction() {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  await runWeeklyPayouts();
  revalidatePath("/admin/finance");
  redirect("/admin/finance");
}

async function saveWeeklyPayoutModeAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const mode = String(formData.get("weeklyPayoutMode") || "") === "automatic" ? "automatic" : "manual";
  await savePayoutConfig({ weeklyPayoutMode: mode });
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
  const payoutError = pick(sp.payoutError);

  const [wrapstars, earnings, payouts, config, holds] = await Promise.all([
    listWrapstars(),
    listEarnings(),
    listPayouts(),
    getPayoutConfig(),
    listPayoutHolds(),
  ]);

  const wallets = await Promise.all(
    wrapstars.map(async (w) => ({
      w,
      wallet: await walletForWrapstar(w.id),
    })),
  );

  const unpaidTotal = wallets.reduce((s, x) => s + x.wallet.unpaidCents, 0);
  const paidTotal = wallets.reduce((s, x) => s + x.wallet.paidCents, 0);
  const weekly = await previewWeeklyPay();
  const weeklyTotal = weekly.lines.reduce((s, line) => s + line.amountCents, 0);
  const payoutMode = config.weeklyPayoutMode === "automatic" ? "automatic" : "manual";
  const platformBank = await getPlatformPayoutBank();

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold text-slate-900">Finance & payouts</h1>
      {payoutError ? (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {payoutError}
        </p>
      ) : null}
      <p className="mt-1 text-sm text-slate-600">
        WrapStars are paid from clock-in to clock-out, at least half an hour and no more than 12 finished
        gifts an hour. WrapRiders get $2.50 per finished gift plus estimated delivery hours. JoyRiders get
        estimated delivery hours only. Traffic does not add delivery pay. Automatic mode sends Thursday at
        6:00pm Eastern. Manual mode waits for Send Thursday payouts. The Friday bank deposit follows either way.
      </p>

      <section className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Outbound payments</h2>
        <form action={saveWeeklyPayoutModeAction} className="mt-3 flex flex-wrap items-end gap-6">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">How should Thursday payouts go out?</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="weeklyPayoutMode" value="manual" defaultChecked={payoutMode === "manual"} />
              Manual — I press Send Thursday payouts
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="weeklyPayoutMode" value="automatic" defaultChecked={payoutMode === "automatic"} />
              Automatic — send Thursday at 6:00pm Eastern
            </label>
          </fieldset>
          <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
            Save
          </button>
        </form>
        <p className="mt-3 text-sm text-slate-600">
          Now: {payoutMode === "automatic" ? "Automatic" : "Manual"}.
          {weekly.stripeReady
            ? " Stripe is live."
            : stripeKeyMode() === "test"
              ? " Stripe is still in test mode. Live keys are required for contractor payouts."
              : " Stripe live key is not set on this server yet."}
          {platformBank
            ? ` Platform bank ${platformBank.bankName} ····${platformBank.last4}.`
            : weekly.stripeReady
              ? " No platform bank is attached in Stripe yet."
              : ""}
        </p>
      </section>

      <section className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">
              This pay week · {weekly.week.startKey} to {weekly.week.endKey}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {formatUsdCents(weeklyTotal)} across {weekly.lines.length} contractors.
            </p>
          </div>
          <form action={runWeeklyPayoutsAction}>
            <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
              Send Thursday payouts
            </button>
          </form>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1 pr-3">Contractor</th>
                <th className="py-1 pr-3">Role</th>
                <th className="py-1 pr-3">Rate</th>
                <th className="py-1 pr-3">Hours</th>
                <th className="py-1 pr-3">Amount</th>
                <th className="py-1 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {weekly.lines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-3 text-slate-500">
                    No approved contractors yet.
                  </td>
                </tr>
              ) : (
                weekly.lines.map((line) => (
                  <tr key={line.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3">{line.name}</td>
                    <td className="py-2 pr-3">{line.role}</td>
                    <td className="py-2 pr-3">{formatUsdCents(line.hourlyRateCents)}</td>
                    <td className="py-2 pr-3">{line.paidHours.toFixed(2)}</td>
                    <td className="py-2 pr-3">{formatUsdCents(line.amountCents)}</td>
                    <td className="py-2 pr-3">
                      {line.status}
                      {line.note ? <span className="block text-xs text-slate-500">{line.note}</span> : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

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
          <p className="text-xs uppercase text-slate-500">Hourly defaults</p>
          <p className="mt-1 text-2xl font-semibold">
            ${((config.wrapstarHourlyCents || 3000) / 100).toFixed(0)} WS · $
            {((config.joyriderHourlyCents || 3000) / 100).toFixed(0)} JR · $
            {((config.wrapriderHourlyCents || 3000) / 100).toFixed(0)} WR
          </p>
          <Link href="/admin/finance/rates" className="text-xs text-blue-700 underline">
            Edit hourly rates
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
            {wallets.map(({ w, wallet }) => {
              const hold = holds[w.id];
              const withheld = !!hold?.held;
              return (
              <tr key={w.id} className="border-t border-slate-100">
                <td className="py-2 pr-3">
                  <Link href={`/admin/wrapstars/${w.id}`} className="text-blue-700 underline">
                    {w.name}
                  </Link>
                  <div className="font-mono text-[10px] text-slate-500">{w.id}</div>
                  {withheld ? (
                    <div className="text-[11px] font-medium text-amber-800">
                      Withheld{hold?.reason ? ` — ${hold.reason}` : ""}
                    </div>
                  ) : null}
                </td>
                <td className="py-2 pr-3">{formatUsdCents(wallet.unpaidCents)}</td>
                <td className="py-2 pr-3">{formatUsdCents(wallet.paidCents)}</td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <form action={createPayoutAction}>
                      <input type="hidden" name="wrapstarId" value={w.id} />
                      <button
                        type="submit"
                        disabled={wallet.unpaidCount === 0 || withheld}
                        className="text-xs text-emerald-700 underline disabled:text-slate-400"
                      >
                        Create payout
                      </button>
                    </form>
                    <form action={setPayoutHoldAction} className="flex items-center gap-1">
                      <input type="hidden" name="contractorId" value={w.id} />
                      <input type="hidden" name="held" value={withheld ? "0" : "1"} />
                      <input
                        name="reason"
                        defaultValue={hold?.reason || ""}
                        placeholder="Reason"
                        className="w-28 rounded border px-1 py-0.5 text-[11px]"
                      />
                      <button type="submit" className="text-xs text-amber-800 underline">
                        {withheld ? "Release" : "Withhold"}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
              );
            })}
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

      <p className="mt-6 text-sm text-slate-600">
        <Link href="/admin/finance/rates" className="text-blue-700 underline">
          Edit hourly rates by ZIP
        </Link>
      </p>
    </div>
  );
}
