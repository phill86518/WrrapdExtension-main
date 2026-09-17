import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getPayoutConfig, savePayoutConfig } from "@/lib/finance";
import {
  formatHourlyZipTable,
  parseHourlyZipTable,
  WRAPSTAR_PACE_GIFTS_PER_HOUR,
} from "@/lib/hourly-rates";

export const dynamic = "force-dynamic";

async function saveAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  await savePayoutConfig({
    wrapstarHourlyCents: Math.round(Number(formData.get("wrapstarHourly") || 0) * 100),
    joyriderHourlyCents: Math.round(Number(formData.get("joyriderHourly") || 0) * 100),
    wrapstarPaceGiftsPerHour: WRAPSTAR_PACE_GIFTS_PER_HOUR,
    hourlyByZip: parseHourlyZipTable(String(formData.get("hourlyByZip") || "")),
  });
  redirect("/admin/finance/rates");
}

export default async function AdminFinanceRatesPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();
  const config = await getPayoutConfig();

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/admin/finance" className="text-sm text-blue-700 underline">
        Back to finance
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Hourly rates by ZIP</h1>
      <p className="mt-1 text-sm text-slate-600">
        WrapStars, JoyRiders, and WrapRiders (hybrid) are paid hourly, not per order. Lookup: exact
        ZIP, then 3-digit prefix, then the role default. WrapRiders use the WrapStar rate for wrap
        hours and the JoyRider rate for delivery hours. WrapStar pace is {WRAPSTAR_PACE_GIFTS_PER_HOUR}{" "}
        gifts per hour — shortfall reduces that hour by (rate ÷ {WRAPSTAR_PACE_GIFTS_PER_HOUR}) per
        unfinished gift. Internal only.
      </p>
      <form action={saveAction} className="mt-6 space-y-4 rounded-xl border bg-white p-4 shadow-sm">
        <label className="block text-sm">
          WrapStar default ($ / hour)
          <input
            name="wrapstarHourly"
            type="number"
            step="0.01"
            min={0}
            defaultValue={((config.wrapstarHourlyCents || 2500) / 100).toFixed(2)}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          JoyRider default ($ / hour)
          <input
            name="joyriderHourly"
            type="number"
            step="0.01"
            min={0}
            defaultValue={((config.joyriderHourlyCents || 2200) / 100).toFixed(2)}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          ZIP overrides (one per line: ZIP WrapStar$ JoyRider$)
          <textarea
            name="hourlyByZip"
            rows={8}
            defaultValue={formatHourlyZipTable(config.hourlyByZip)}
            placeholder={"32218 26.00 23.00\n322 25.00 22.00\n303 27.00 24.00"}
            className="mt-1 w-full rounded border px-3 py-2 font-mono text-sm"
          />
        </label>
        <p className="text-xs text-slate-500">
          Use a 5-digit ZIP or a 3-digit prefix. Same pattern as Allowed ZIP codes. See
          docs/CONTRACTOR-HOURLY-PAY.md.
        </p>
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm text-white">
          Save hourly rates
        </button>
      </form>
    </div>
  );
}
