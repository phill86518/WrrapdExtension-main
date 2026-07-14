import { AdminPricingEditor } from "@/components/admin-pricing-editor";
import { WrrapdLogo } from "@/components/wrrapd-logo";
import { getSession } from "@/lib/auth";
import {
  fetchWrrapdPricingConfig,
  fetchZipCountyIndex,
  saveWrrapdPricingConfig,
  type PricingConfig,
  type ZipCountyIndex,
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

async function loadZipCountyIndexAction(): Promise<
  { ok: true; index: ZipCountyIndex } | { ok: false; error: string }
> {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { ok: false, error: "Unauthorized" };
  }
  try {
    const index = await fetchZipCountyIndex();
    return { ok: true, index };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to load counties" };
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
    <div className="mx-auto max-w-5xl">
      <WrrapdLogo className="mt-2 h-10 w-auto max-w-[180px] object-contain object-left" />
      <h1 className="mt-2 text-3xl font-semibold">Checkout pricing</h1>
      <p className="mt-1 text-sm text-slate-600">
        Default and retailer prices, plus state/county rates that apply to every giftee ZIP in that area.
        Changes apply to new checkout sessions after save (extension caches prices ~5 minutes).
      </p>

      {loadError && (
        <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Could not load pricing: {loadError}. Ensure{" "}
          <code className="rounded bg-red-100 px-1">WRRAPD_ADMIN_API_KEY</code> matches on the tracking
          platform and pay server.
        </p>
      )}

      {config && (
        <AdminPricingEditor
          initialConfig={config}
          saveAction={savePricingAction}
          loadZipCountyIndexAction={loadZipCountyIndexAction}
        />
      )}
    </div>
  );
}
