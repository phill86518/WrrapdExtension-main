import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getPayoutConfig, savePayoutConfig } from "@/lib/finance";
import { formatHourlyZipTable, parseHourlyZipTable } from "@/lib/hourly-rates";

export const dynamic = "force-dynamic";

async function saveAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  await savePayoutConfig({
    wrapstarHourlyCents: 0,
    joyriderHourlyCents: Math.round(Number(formData.get("joyriderHourly") || 0) * 100),
    wrapriderHourlyCents: Math.round(Number(formData.get("wrapriderHourly") || 0) * 100),
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
      <h1 className="mt-3 text-2xl font-semibold">Pay rates</h1>
      <p className="mt-1 text-sm text-slate-600">
        WrapStars and WrapRiders earn $30.00 per dozen finished wraps (prorated for fewer or more
        than a dozen), plus a $15.00 bonus upon every 100 wrapped boxes. JoyRiders and WrapRiders
        also earn a delivery rate for the planned route — exact ZIP, then 3-digit prefix, then the
        role default. Internal only.
      </p>
      <form action={saveAction} className="mt-6 space-y-4 rounded-xl border bg-white p-4 shadow-sm">
        <label className="block text-sm">
          JoyRider default ($ / hour for the planned route)
          <input
            name="joyriderHourly"
            type="number"
            step="0.01"
            min={0}
            defaultValue={((config.joyriderHourlyCents || 3000) / 100).toFixed(2)}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          WrapRider delivery default ($ / hour for the planned route)
          <input
            name="wrapriderHourly"
            type="number"
            step="0.01"
            min={0}
            defaultValue={((config.wrapriderHourlyCents || 3000) / 100).toFixed(2)}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <p className="text-sm text-slate-600">
          Wrapping is always $30.00 per dozen (prorated) plus a $15.00 bonus every 100 wrapped boxes
          for WrapStars and WrapRiders. Those amounts are not edited here.
        </p>
        <label className="block text-sm">
          ZIP overrides (one per line: ZIP unused JoyRider$ WrapRider$ — first dollar column is ignored)
          <textarea
            name="hourlyByZip"
            rows={8}
            defaultValue={formatHourlyZipTable(config.hourlyByZip)}
            placeholder={"32218 0 30.00 30.00\n322 0 30.00 30.00"}
            className="mt-1 w-full rounded border px-3 py-2 font-mono text-sm"
          />
        </label>
        <p className="text-xs text-slate-500">
          Use a 5-digit ZIP or a 3-digit prefix. The first dollar column is unused (wrapping is per dozen). Columns 2 and 3 are JoyRider and WrapRider delivery rates.
        </p>
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm text-white">
          Save delivery rates
        </button>
      </form>
    </div>
  );
}
