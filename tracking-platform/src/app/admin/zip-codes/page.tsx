import { AdminDeliveryHubs } from "@/components/admin-delivery-hubs";
import { AdminZipCodesEditor } from "@/components/admin-zip-codes-editor";
import { WrrapdLogo } from "@/components/wrrapd-logo";
import { getSession } from "@/lib/auth";
import {
  addAllowedZipCodes,
  checkAllowedZipCode,
  fetchAllowedZipCodes,
  removeAllowedZipCodes,
  replaceAllowedZipCodes,
  seedAllowedZipCodesStates,
  seedLaunchMetroZipCodes,
  type AllowedZipCodesPayload,
} from "@/lib/wrrapd-zip-codes-admin";
import {
  checkDeliveryHubZip,
  fetchDeliveryHubReport,
  removeDeliveryHub,
  setDefaultDeliveryHub,
  setDeliveryHubActive,
  upsertDeliveryHub,
  type DeliveryHubInput,
  type DeliveryHubReport,
} from "@/lib/delivery-hubs-admin";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function addAction(zips: string[]) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { ok: false as const, error: "Unauthorized" };
  }
  try {
    const data = await addAllowedZipCodes(zips);
    revalidatePath("/admin/zip-codes");
    return { ok: true as const, data, added: data.added };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed to add ZIPs" };
  }
}

async function removeAction(zips: string[]) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { ok: false as const, error: "Unauthorized" };
  }
  try {
    const data = await removeAllowedZipCodes(zips);
    revalidatePath("/admin/zip-codes");
    return { ok: true as const, data, removed: data.removed };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed to remove ZIPs" };
  }
}

async function replaceAction(zips: string[], notes?: string) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { ok: false as const, error: "Unauthorized" };
  }
  try {
    const data = await replaceAllowedZipCodes(zips, notes);
    revalidatePath("/admin/zip-codes");
    return { ok: true as const, data };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed to replace ZIPs" };
  }
}

async function checkAction(zip: string) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { ok: false as const, error: "Unauthorized" };
  }
  try {
    const result = await checkAllowedZipCode(zip);
    return { ok: true as const, result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed to check ZIP" };
  }
}

async function seedFlGaAction() {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { ok: false as const, error: "Unauthorized" };
  }
  try {
    const data = await seedAllowedZipCodesStates(["FL", "GA"]);
    revalidatePath("/admin/zip-codes");
    return { ok: true as const, data };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed to seed ZIPs" };
  }
}

async function seedLaunchMetrosAction() {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { ok: false as const, error: "Unauthorized" };
  }
  try {
    const data = await seedLaunchMetroZipCodes();
    revalidatePath("/admin/zip-codes");
    return { ok: true as const, data };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed to seed launch metros" };
  }
}

type HubReportResult = { ok: true; report: DeliveryHubReport } | { ok: false; error: string };

async function hubAction(fn: () => Promise<DeliveryHubReport>, fallback: string): Promise<HubReportResult> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { ok: false, error: "Unauthorized" };
  }
  try {
    const report = await fn();
    revalidatePath("/admin/zip-codes");
    return { ok: true, report };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : fallback };
  }
}

async function upsertHubAction(input: DeliveryHubInput) {
  "use server";
  return hubAction(() => upsertDeliveryHub(input), "Failed to save hub");
}

async function removeHubAction(id: string) {
  "use server";
  return hubAction(() => removeDeliveryHub(id), "Failed to remove hub");
}

async function setHubActiveAction(id: string, active: boolean) {
  "use server";
  return hubAction(() => setDeliveryHubActive(id, active), "Failed to update hub");
}

async function setDefaultHubAction(id: string) {
  "use server";
  return hubAction(() => setDefaultDeliveryHub(id), "Failed to set default hub");
}

async function checkHubAction(zip: string) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { ok: false as const, error: "Unauthorized" };
  }
  try {
    return { ok: true as const, result: await checkDeliveryHubZip(zip) };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed to check ZIP" };
  }
}

export default async function AdminZipCodesPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();

  let initial: AllowedZipCodesPayload | null = null;
  let loadError: string | null = null;
  try {
    initial = await fetchAllowedZipCodes();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Failed to load allowed ZIP codes";
  }

  let hubReport: DeliveryHubReport | null = null;
  let hubError: string | null = null;
  try {
    hubReport = await fetchDeliveryHubReport();
  } catch (e) {
    hubError = e instanceof Error ? e.message : "Failed to load delivery hubs";
  }

  return (
    <div className="mx-auto max-w-5xl">
      <WrrapdLogo className="mt-2 h-10 w-auto max-w-[180px] object-contain object-left" />
      <h1 className="mt-2 text-3xl font-semibold">Allowed ZIP codes</h1>
      <p className="mt-1 text-sm text-slate-600">
        Manage which giftee ZIP codes can receive gift wrapping. Checkout uses this allowlist before
        showing pricing. <strong>Open Map</strong> to click ZIP codes on or off across the country,
        including Alaska and Hawaii. For now the allowlist is strictly Duval County / Jacksonville.
      </p>

      {loadError && (
        <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Could not load allowlist: {loadError}. Ensure{" "}
          <code className="rounded bg-red-100 px-1">WRRAPD_ADMIN_API_KEY</code> matches on the tracking
          platform and pay server.
        </p>
      )}

      {initial ? (
        <AdminZipCodesEditor
          initial={initial}
          onAdd={addAction}
          onRemove={removeAction}
          onReplace={replaceAction}
          onCheck={checkAction}
          onSeedFlGa={seedFlGaAction}
          onSeedLaunchMetros={seedLaunchMetrosAction}
        />
      ) : null}

      {hubError ? (
        <p className="mt-10 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Could not load delivery hubs: {hubError}
        </p>
      ) : null}
      {hubReport ? (
        <AdminDeliveryHubs
          initial={hubReport}
          onUpsert={upsertHubAction}
          onRemove={removeHubAction}
          onSetActive={setHubActiveAction}
          onSetDefault={setDefaultHubAction}
          onCheck={checkHubAction}
        />
      ) : null}
    </div>
  );
}
