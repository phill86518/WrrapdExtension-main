import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listDrivers, runAutoAllocation, unassignDeletedDriverOrders } from "@/lib/data";
import {
  readDriverProfiles,
  setForcedAvailableDates,
  setOnboardingStatus,
} from "@/lib/driver-profiles";
import { addDriver, deleteDriver } from "@/lib/driver-registry";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function addDriverAction(formData: FormData) {
  "use server";
  const name = String(formData.get("name") || "");
  const res = await addDriver(name);
  if (!res.ok) {
    redirect(`/admin/drivers?error=${encodeURIComponent(res.error)}`);
  }
  revalidatePath("/admin");
  revalidatePath("/admin/drivers");
  await runAutoAllocation();
}

async function deleteDriverAction(formData: FormData) {
  "use server";
  const driverId = String(formData.get("driverId") || "");
  const res = await deleteDriver(driverId);
  if (!res.ok) {
    redirect(`/admin/drivers?error=${encodeURIComponent(res.error)}`);
  }
  await unassignDeletedDriverOrders(driverId);
  revalidatePath("/admin");
  revalidatePath("/admin/drivers");
}

async function updateOnboardingAction(formData: FormData) {
  "use server";
  const driverId = String(formData.get("driverId") || "");
  const status = String(formData.get("status") || "pending") as
    | "pending"
    | "approved"
    | "rejected";
  const notes = String(formData.get("notes") || "");
  await setOnboardingStatus(driverId, status, notes);
  await runAutoAllocation();
  revalidatePath("/admin");
  revalidatePath("/admin/drivers");
}

async function updateForcedAvailabilityAction(formData: FormData) {
  "use server";
  const driverId = String(formData.get("driverId") || "");
  const raw = String(formData.get("forcedAvailableDates") || "");
  const dates = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  await setForcedAvailableDates(driverId, dates);
  await runAutoAllocation();
  revalidatePath("/admin");
  revalidatePath("/admin/drivers");
}

export default async function AdminDriversPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const query = searchParams ? await searchParams : {};
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();

  const [drivers, profiles] = await Promise.all([listDrivers(), readDriverProfiles()]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <a href="/admin" className="text-sm text-blue-700 underline">
        Back to dashboard
      </a>
      <h1 className="mt-3 text-3xl font-semibold">Driver Onboarding</h1>
      <p className="mt-1 text-sm text-slate-600">
        Drivers must be approved before any assignment. Roger is the primary driver for auto-allocation.
      </p>

      {query.error && (
        <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {query.error}
        </p>
      )}

      <section className="mt-4 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Add Driver</h2>
        <form action={addDriverAction} className="mt-2 flex flex-wrap items-center gap-2">
          <input
            name="name"
            placeholder="Driver name"
            className="min-w-52 rounded border px-3 py-2 text-sm"
            required
          />
          <button type="submit" className="rounded bg-black px-3 py-2 text-sm font-semibold text-white">
            Add Driver
          </button>
        </form>
      </section>

      <div className="mt-4 space-y-4">
        {drivers.map((d) => {
          const p = profiles[d.id] ?? { driverId: d.id, onboardingStatus: "pending" as const };
          return (
            <section key={d.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{d.name}</h2>
                  <p className="mt-1 text-xs text-slate-500">Driver ID: {d.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs uppercase tracking-wide">
                    {p.onboardingStatus}
                  </span>
                  <form action={deleteDriverAction}>
                    <input type="hidden" name="driverId" value={d.id} />
                    <button
                      type="submit"
                      className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700"
                    >
                      Delete Driver
                    </button>
                  </form>
                </div>
              </div>

              <form action={updateOnboardingAction} className="mt-3 grid gap-2 md:grid-cols-3">
                <input type="hidden" name="driverId" value={d.id} />
                <select name="status" defaultValue={p.onboardingStatus} className="rounded border px-2 py-1">
                  <option value="pending">pending</option>
                  <option value="approved">approved</option>
                  <option value="rejected">rejected</option>
                </select>
                <input
                  name="notes"
                  defaultValue={p.notes || ""}
                  placeholder="Notes"
                  className="rounded border px-2 py-1 md:col-span-1"
                />
                <button type="submit" className="rounded border px-2 py-1">
                  Save onboarding
                </button>
              </form>

              <form action={updateForcedAvailabilityAction} className="mt-2 grid gap-2 md:grid-cols-3">
                <input type="hidden" name="driverId" value={d.id} />
                <input
                  name="forcedAvailableDates"
                  defaultValue={(p.forcedAvailableDates || []).join(", ")}
                  placeholder="YYYY-MM-DD, YYYY-MM-DD"
                  className="rounded border px-2 py-1 md:col-span-2"
                />
                <button type="submit" className="rounded border px-2 py-1">
                  Save manual overrides
                </button>
              </form>
            </section>
          );
        })}
      </div>
    </main>
  );
}
