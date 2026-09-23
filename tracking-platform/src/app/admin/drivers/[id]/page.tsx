import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { findDeliveryDriverById, updateDeliveryDriver } from "@/lib/driver-registry";
import { listMetros } from "@/lib/metros";
import type { MetroId, OnboardingStatus } from "@/lib/types";
import { getPayoutHold } from "@/lib/finance";
import { setPayoutHoldAction } from "../../payout-hold-action";

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
  const { parseHourlyRateDollarsInput } = await import("@/lib/hourly-rates");
  const rateCents = parseHourlyRateDollarsInput(formData.get("hourlyRateDollars"));
  await updateDeliveryDriver(id, {
    name: String(formData.get("name") || ""),
    homePostalCode: String(formData.get("homePostalCode") || ""),
    metroId: String(formData.get("metroId") || "") as MetroId,
    status: String(formData.get("status") || "pending") as OnboardingStatus,
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    notes: String(formData.get("notes") || ""),
    servicePostalCodes,
    ...(rateCents ? { hourlyRateCents: rateCents } : {}),
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
  if (driver.hireRole === "wraprider") {
    redirect(driver.wrapriderId ? `/admin/wrapriders/${driver.wrapriderId}` : "/admin/wrapriders");
  }
  const metros = listMetros();
  const payoutHold = await getPayoutHold(driver.id);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/drivers" className="text-sm text-blue-700 underline">
        Back to JoyRiders
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-slate-900">{driver.name}</h1>
      <p className="font-mono text-sm text-slate-600">
        {driver.displayId || driver.id}
        {driver.displayId && driver.displayId !== driver.id ? (
          <span className="ml-2 text-xs text-slate-400">({driver.id})</span>
        ) : null}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        JoyRider (final-mile courier) — separate from WrapStars. App: joyrider.wrrapd.com
      </p>

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
          Hourly rate ($ / hour)
          <input
            name="hourlyRateDollars"
            type="number"
            step="0.01"
            min={1}
            defaultValue={
              driver.hourlyRateCents ? (driver.hourlyRateCents / 100).toFixed(2) : "30.00"
            }
            className="mt-1 w-full rounded border px-3 py-2"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Person rate set at onboarding. Change here to override for this JoyRider.
          </span>
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
          Save JoyRider
        </button>
      </form>

      <form action={setPayoutHoldAction} className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <input type="hidden" name="contractorId" value={driver.id} />
        <input type="hidden" name="held" value={payoutHold?.held ? "0" : "1"} />
        <p className="text-sm font-medium text-amber-950">
          {payoutHold?.held ? "Payouts withheld" : "Payouts can leave"}
        </p>
        <p className="text-xs text-amber-900">
          Withheld earnings stay unpaid. A payout batch cannot be created until you release the hold.
        </p>
        <label className="block text-sm">
          Reason
          <input
            name="reason"
            defaultValue={payoutHold?.reason || ""}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded border border-amber-800 px-3 py-1.5 text-sm text-amber-950">
          {payoutHold?.held ? "Release payouts" : "Withhold payouts"}
        </button>
      </form>
    </div>
  );
}
