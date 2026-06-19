import { AdminPricingEditor } from "@/components/admin-pricing-editor";
import { WrrapdLogo } from "@/components/wrrapd-logo";
import { getSession } from "@/lib/auth";
import {
  fetchWrrapdPricingConfig,
  saveWrrapdPricingConfig,
  type PricingConfig,
} from "@/lib/wrrapd-pricing-admin";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function savePricingAction(config: PricingConfig) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { ok: false as const, error: "Unauthorized" };
  }
  try {
    const saved = await saveWrrapdPricingConfig(config);
    revalidatePath("/admin/pricing");
    return { ok: true as const, config: saved };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Failed to save pricing",
    };
  }
}

export default async function AdminPricingPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();

  let config: PricingConfig | null = null;
  let loadError: string | null = null;
  try {
    config = await fetchWrrapdPricingConfig();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Failed to load pricing config";
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <a href="/admin" className="text-sm text-blue-700 underline">
        Back to Command Center
      </a>
      <WrrapdLogo className="mt-4 h-10 w-auto max-w-[180px] object-contain object-left" />
      <h1 className="mt-2 text-3xl font-semibold">Dynamic pricing</h1>
      <p className="mt-1 text-sm text-slate-600">
        Adjust Wrrapd gift-wrap, AI/upload add-ons, and flowers pricing for each retailer. Changes apply to new
        checkout sessions after save (extension caches prices for about five minutes).
      </p>

      {loadError && (
        <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Could not load pricing: {loadError}. Ensure{" "}
          <code className="rounded bg-red-100 px-1">WRRAPD_ADMIN_API_KEY</code> matches on the tracking platform and
          pay server, and that <code className="rounded bg-red-100 px-1">WRRAPD_ADMIN_API_KEY</code> is set on{" "}
          <code className="rounded bg-red-100 px-1">wrrapd-server</code>.
        </p>
      )}

      {config && <AdminPricingEditor initialConfig={config} saveAction={savePricingAction} />}
    </main>
  );
}
