import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";
import { getPayoutConfig, savePayoutConfig } from "@/lib/finance";

export const dynamic = "force-dynamic";

async function saveAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  await savePayoutConfig({
    basePayCents: Math.round(Number(formData.get("basePayDollars") || 0) * 100),
    peakMultiplier: Number(formData.get("peakMultiplier") || 1.25),
    platformFeeCents: Math.round(Number(formData.get("platformFeeDollars") || 0) * 100),
    tipPassthrough: formData.get("tipPassthrough") === "on",
    platformTakeWrapPercent: Number(formData.get("platformTakeWrapPercent") || 28),
    platformTakeFlowersPercent: Number(formData.get("platformTakeFlowersPercent") || 15),
  });
  redirect("/admin/finance");
}

export default async function AdminFinanceRatesPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();
  const config = await getPayoutConfig();

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <AdminNav current="/admin/finance" />
      <Link href="/admin/finance" className="text-sm text-blue-700 underline">
        Back to finance
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Payout rates</h1>
      <p className="mt-1 text-sm text-slate-600">
        Wrrapd collects 100% of customer revenue. WrapStar pay = remainder after platform take on wrap
        (default 28%) and flowers (default 15%). Flat base pay is only a fallback when an order has no
        revenue breakdown.
      </p>
      <form action={saveAction} className="mt-6 space-y-4 rounded-xl border bg-white p-4 shadow-sm">
        <label className="block text-sm">
          Platform take — gift wrap incl. AI/upload (%)
          <input
            name="platformTakeWrapPercent"
            type="number"
            step="0.1"
            min={0}
            max={100}
            defaultValue={config.platformTakeWrapPercent ?? 28}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Platform take — flowers (%)
          <input
            name="platformTakeFlowersPercent"
            type="number"
            step="0.1"
            min={0}
            max={100}
            defaultValue={config.platformTakeFlowersPercent ?? 15}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Fallback base pay per delivered order ($)
          <input
            name="basePayDollars"
            type="number"
            step="0.01"
            defaultValue={(config.basePayCents / 100).toFixed(2)}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Peak multiplier (reserved)
          <input
            name="peakMultiplier"
            type="number"
            step="0.01"
            defaultValue={config.peakMultiplier}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Extra platform fee ($)
          <input
            name="platformFeeDollars"
            type="number"
            step="0.01"
            defaultValue={(config.platformFeeCents / 100).toFixed(2)}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input name="tipPassthrough" type="checkbox" defaultChecked={config.tipPassthrough} />
          Pass tips through to WrapStar
        </label>
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm text-white">
          Save
        </button>
      </form>
    </main>
  );
}
