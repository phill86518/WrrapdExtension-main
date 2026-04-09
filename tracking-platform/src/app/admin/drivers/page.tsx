import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listDrivers } from "@/lib/data";
import {
  readDriverProfiles,
  setForcedAvailableDates,
  setOnboardingStatus,
} from "@/lib/driver-profiles";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function updateOnboardingAction(formData: FormData) {
  "use server";
  const driverId = String(formData.get("driverId") || "");
  const status = String(formData.get("status") || "pending") as
    | "pending"
    | "approved"
    | "rejected";
  const notes = String(formData.get("notes") || "");
  await setOnboardingStatus(driverId, status, notes);
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
  revalidatePath("/admin/drivers");
}

export default async function AdminDriversPage() {
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

      <div className="mt-4 space-y-4">
        {drivers.map((d) => {
          const p = profiles[d.id] ?? { driverId: d.id, onboardingStatus: "pending" as const };
          return (
            <section key={d.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{d.name}</h2>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs uppercase tracking-wide">
                  {p.onboardingStatus}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Driver ID: {d.id}</p>

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
