import { AdminNav } from "@/components/admin-nav";
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
  type AllowedZipCodesPayload,
} from "@/lib/wrrapd-zip-codes-admin";
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

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <AdminNav current="/admin/zip-codes" />
      <WrrapdLogo className="mt-2 h-10 w-auto max-w-[180px] object-contain object-left" />
      <h1 className="mt-2 text-3xl font-semibold">Allowed ZIP codes</h1>
      <p className="mt-1 text-sm text-slate-600">
        Manage which giftee ZIP codes can receive Wrrapd deliveries. Checkout and gift modals use this
        allowlist before showing pricing. Currently seeded for Florida and Georgia; add or remove as you
        expand.
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
        />
      ) : null}
    </main>
  );
}
