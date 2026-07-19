"use client";

type Props = {
  unpaidCents: number;
  paidCents: number;
  lifetimeCents: number;
  unpaidCount: number;
  recent: Array<{
    id: string;
    orderId: string;
    netCents: number;
    earnedAt: string;
    status: string;
  }>;
};

function usd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function WrapstarEarningsPanel({
  unpaidCents,
  paidCents,
  lifetimeCents,
  unpaidCount,
  recent,
}: Props) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Earnings</h2>
        <p className="mt-1 text-sm text-slate-600">Your wrap pay summary (read-only).</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unpaid</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{usd(unpaidCents)}</p>
          <p className="mt-1 text-xs text-slate-500">{unpaidCount} open</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paid</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{usd(paidCents)}</p>
        </div>
        <div className="col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Lifetime</p>
          <p className="mt-1 text-2xl font-semibold text-amber-950">{usd(lifetimeCents)}</p>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Recent</h3>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No earnings yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {recent.slice(0, 20).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{e.orderId}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(e.earnedAt).toLocaleString()} · {e.status}
                  </p>
                </div>
                <p className="shrink-0 font-semibold text-slate-900">{usd(e.netCents)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
