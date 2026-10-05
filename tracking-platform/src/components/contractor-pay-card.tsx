import { formatUsdCents } from "@/lib/finance";
import type { ContractorPayRole } from "@/lib/hourly-rates";
import { previewForContractor } from "@/lib/weekly-pay";
import { getStripeConnectAccount, stripeConfigured } from "@/lib/stripe-connect";

function hoursText(hours: number): string {
  const mins = Math.round(hours * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export async function ContractorPayCard({
  contractorId,
  role,
  showConnect = false,
}: {
  contractorId: string;
  role: ContractorPayRole;
  showConnect?: boolean;
}) {
  const [line, bank] = await Promise.all([
    previewForContractor(contractorId),
    getStripeConnectAccount(contractorId),
  ]);
  if (!line) return null;
  const ready = stripeConfigured();
  const bankReady = Boolean(bank?.payoutsEnabled);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">This week</h2>
      <p className="mt-1 text-sm text-slate-600">
        {role === "wraprider"
          ? `$30.00 per dozen finished wraps (prorated for fewer or more than a dozen), plus a $15.00 bonus upon every 100 wrapped boxes, plus ${formatUsdCents(line.hourlyRateCents)} an hour for the planned delivery route. Traffic does not add pay`
          : role === "wrapstar"
            ? "$30.00 per dozen finished wraps (prorated for fewer or more than a dozen), plus a $15.00 bonus upon every 100 wrapped boxes. Clock time does not change wrapping pay"
            : `${formatUsdCents(line.hourlyRateCents)} an hour for the planned delivery route. Traffic does not add pay`}
        .
      </p>
      <p className="mt-3 text-3xl font-semibold text-slate-900">{formatUsdCents(line.amountCents)}</p>
      <p className="mt-1 text-sm text-slate-600">
        {line.weekStart} to {line.weekEnd}
        {line.finishedGifts > 0 ? ` · ${line.finishedGifts} wraps` : ""}
        {(line.wrappingBonusCents || 0) > 0 ? ` · ${formatUsdCents(line.wrappingBonusCents)} bonus` : ""}
        {line.paidHours > 0 ? ` · ${hoursText(line.paidHours)} planned delivery` : ""}
        {line.deliveryWindows > 0 ? ` · ${line.deliveryWindows} delivery windows` : ""}
      </p>
      <p className="mt-2 text-sm text-slate-600">
        Payouts go out Thursday at 6:00pm Eastern. The deposit is in your bank on Friday.
      </p>
      <p className="mt-2 text-sm">
        {line.status === "withheld"
          ? "This payout is on hold. The amount stays unpaid."
          : line.status === "paid"
            ? "This week has been sent to your bank."
            : bankReady
              ? `Bank connected${bank?.bankLast4 ? ` ····${bank.bankLast4}` : ""}.`
              : "Bank is not connected yet."}
      </p>
      {showConnect && ready && !bankReady ? (
        <a
          href="/api/contractor/stripe/connect"
          className="mt-3 inline-block rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
        >
          Connect bank
        </a>
      ) : null}
      {showConnect && !ready ? (
        <p className="mt-3 text-sm text-amber-800">Bank connection opens once payouts are turned on.</p>
      ) : null}
    </section>
  );
}
