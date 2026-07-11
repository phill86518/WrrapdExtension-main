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
        Applied when an order is marked delivered (earnings ledger entry).
      </p>
      <form action={saveAction} className="mt-6 space-y-4 rounded-xl border bg-white p-4 shadow-sm">
        <label className="block text-sm">
          Base pay per delivered order ($)
          <input
            name="basePayDollars"
            type="number"
            step="0.01"
            defaultValue={(config.basePayCents / 100).toFixed(2)}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Peak multiplier
          <input
            name="peakMultiplier"
            type="number"
            step="0.01"
            defaultValue={config.peakMultiplier}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Platform fee ($)
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
