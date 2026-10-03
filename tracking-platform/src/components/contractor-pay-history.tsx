import Link from "next/link";
import { formatUsdCents } from "@/lib/finance";
import { NEC_THRESHOLD_CENTS, payHistoryForContractor } from "@/lib/contractor-pay-history";

export async function ContractorPayHistory({
  contractorId,
  admin = false,
}: {
  contractorId: string;
  admin?: boolean;
}) {
  const history = await payHistoryForContractor(contractorId);
  const statement = (year: number) => {
    const q = new URLSearchParams({ year: String(year), contractorId });
    return `/api/contractor/pay-statement?${q.toString()}`;
  };
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Pay by year</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">This year</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{formatUsdCents(history.ytdCents)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Last year</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{formatUsdCents(history.lastYearCents)}</p>
        </div>
      </div>
      {history.years.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">Paid weeks will show here after the first payout.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {history.years.map((year) => (
            <li key={year.year} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <p className="font-medium text-slate-900">{year.year}</p>
                <p className="text-sm text-slate-600">
                  {formatUsdCents(year.paidCents)} · {year.weekCount} {year.weekCount === 1 ? "week" : "weeks"}
                  {year.paidCents >= NEC_THRESHOLD_CENTS ? " · 1099-NEC copy" : ""}
                </p>
              </div>
              <Link
                href={statement(year.year)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800"
                target="_blank"
              >
                {admin ? "Open statement" : "Statement"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
