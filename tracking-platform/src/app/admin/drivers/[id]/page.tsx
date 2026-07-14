import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { findDeliveryDriverById, updateDeliveryDriver } from "@/lib/driver-registry";
import { listMetros } from "@/lib/metros";
import type { MetroId, OnboardingStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

async function updateAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const id = String(formData.get("driverId") || "");
  const serviceRaw = String(formData.get("servicePostalCodes") || "");
  const servicePostalCodes = serviceRaw
    .split(/[\s,]+/)
    .map((s) => s.replace(/\D/g, "").slice(0, 5))
    .filter((s) => s.length === 5);
  await updateDeliveryDriver(id, {
    name: String(formData.get("name") || ""),
    homePostalCode: String(formData.get("homePostalCode") || ""),
    metroId: String(formData.get("metroId") || "") as MetroId,
    status: String(formData.get("status") || "pending") as OnboardingStatus,
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    notes: String(formData.get("notes") || ""),
    servicePostalCodes,
  });
  revalidatePath(`/admin/drivers/${id}`);
  revalidatePath("/admin/drivers");
  redirect(`/admin/drivers/${id}`);
}

export default async function AdminDriverDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();
  const { id } = await params;
  const driver = await findDeliveryDriverById(id);
  if (!driver) notFound();
  const metros = listMetros();

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/drivers" className="text-sm text-blue-700 underline">
        Back to Drivers
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-slate-900">{driver.name}</h1>
      <p className="font-mono text-sm text-slate-600">{driver.id}</p>

      <form action={updateAction} className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <input type="hidden" name="driverId" value={driver.id} />
        <label className="block text-sm">
          Name
          <input
            name="name"
            defaultValue={driver.name}
            required
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Home ZIP
          <input
            name="homePostalCode"
            defaultValue={driver.homePostalCode}
            required
            pattern="[0-9]{5}"
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Metro
          <select
            name="metroId"
            defaultValue={driver.metroId}
            className="mt-1 w-full rounded border px-3 py-2"
            required
          >
            {metros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Status
          <select
            name="status"
            defaultValue={driver.status}
            className="mt-1 w-full rounded border px-3 py-2"
          >
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
          </select>
        </label>
        <label className="block text-sm">
          Service ZIPs (optional, comma-separated)
          <input
            name="servicePostalCodes"
            defaultValue={(driver.servicePostalCodes || []).join(", ")}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Email
          <input
            name="email"
            type="email"
            defaultValue={driver.email || ""}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Phone
          <input
            name="phone"
            defaultValue={driver.phone || ""}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Notes
          <textarea
            name="notes"
            defaultValue={driver.notes || ""}
            rows={3}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm text-white">
          Save Driver
        </button>
      </form>
    </div>
  );
}
