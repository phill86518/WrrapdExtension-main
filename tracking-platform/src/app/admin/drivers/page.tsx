import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { listCourierDrivers, listWrapstars, unassignDeletedCourierDriverOrders } from "@/lib/data";
import {
  addDeliveryDriver,
  deleteDeliveryDriver,
  updateDeliveryDriver,
} from "@/lib/driver-registry";
import {
  countWrapOnlyInMetro,
  isDriverNetworkUnlocked,
  listMetros,
  metroForPostalCode,
} from "@/lib/metros";
import type { MetroId, OnboardingStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

async function addAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const metroRaw = String(formData.get("metroId") || "");
  await addDeliveryDriver({
    name: String(formData.get("name") || ""),
    homePostalCode: String(formData.get("homePostalCode") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    metroId: metroRaw ? (metroRaw as MetroId) : undefined,
    status: "pending",
  });
  revalidatePath("/admin/drivers");
  redirect("/admin/drivers");
}

async function deleteAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const id = String(formData.get("driverId") || "");
  const res = await deleteDeliveryDriver(id);
  if (res.ok) await unassignDeletedCourierDriverOrders(id);
  revalidatePath("/admin/drivers");
  revalidatePath("/admin/orders");
}

async function statusAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const id = String(formData.get("driverId") || "");
  const status = String(formData.get("status") || "pending") as OnboardingStatus;
  const notes = String(formData.get("notes") || "");
  await updateDeliveryDriver(id, { status, notes });
  revalidatePath("/admin/drivers");
}

export default async function AdminDriversPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();

  const [drivers, wrapstars, metros] = await Promise.all([
    listCourierDrivers(),
    listWrapstars(),
    Promise.resolve(listMetros()),
  ]);

  const metroRows = metros.map((m) => {
    const wrapOnly = countWrapOnlyInMetro(m.id, wrapstars);
    const unlocked = isDriverNetworkUnlocked(m.id, wrapOnly);
    const driversInMetro = drivers.filter((d) => d.metroId === m.id);
    return { m, wrapOnly, unlocked, driversInMetro };
  });

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold text-slate-900">Drivers</h1>
      <p className="mt-1 text-sm text-slate-600">
        Courier Drivers for PO pickup and final mile. Separate from WrapStars who wrap (and may
        self-deliver).
      </p>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Metro readiness</h2>
        <p className="mt-1 text-xs text-slate-500">
          Driver network unlocks when a metro has ≥3 wrap-only WrapStars (configurable per metro).
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Metro</th>
                <th className="px-3 py-2">Wrap-only</th>
                <th className="px-3 py-2">Unlock</th>
                <th className="px-3 py-2">Drivers</th>
              </tr>
            </thead>
            <tbody>
              {metroRows.map(({ m, wrapOnly, unlocked, driversInMetro }) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{m.name}</td>
                  <td className="px-3 py-2">
                    {wrapOnly} / {m.driverUnlockMinWrapOnlyCount}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        unlocked
                          ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"
                          : "rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900"
                      }
                    >
                      {unlocked ? "Unlocked" : "Locked"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{driversInMetro.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <form
        action={addAction}
        className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-6"
      >
        <input name="name" placeholder="Name" required className="rounded border px-3 py-2 text-sm" />
        <input
          name="homePostalCode"
          placeholder="Home ZIP"
          required
          pattern="[0-9]{5}"
          className="rounded border px-3 py-2 text-sm"
        />
        <select name="metroId" className="rounded border px-3 py-2 text-sm" defaultValue="">
          <option value="">Metro (auto from ZIP)</option>
          {metros.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <input name="email" placeholder="Email" type="email" className="rounded border px-3 py-2 text-sm" />
        <input name="phone" placeholder="Phone" className="rounded border px-3 py-2 text-sm" />
        <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm text-white">
          Add Driver
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Metro</th>
              <th className="px-3 py-2">Home ZIP</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {drivers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  No Drivers yet — add one above when a metro unlocks.
                </td>
              </tr>
            ) : (
              drivers.map((d) => {
                const metro = listMetros().find((m) => m.id === d.metroId);
                const inferred = metroForPostalCode(d.homePostalCode);
                return (
                  <tr key={d.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-3 font-mono text-xs">
                      <Link href={`/admin/drivers/${d.id}`} className="text-blue-700 underline">
                        {d.displayId || d.id}
                      </Link>
                    </td>
                    <td className="px-3 py-3 font-medium">{d.name}</td>
                    <td className="px-3 py-3">{metro?.name || inferred?.name || d.metroId}</td>
                    <td className="px-3 py-3">{d.homePostalCode}</td>
                    <td className="px-3 py-3">
                      <form action={statusAction} className="space-y-1">
                        <input type="hidden" name="driverId" value={d.id} />
                        <select
                          name="status"
                          defaultValue={d.status}
                          className="rounded border px-2 py-1 text-xs"
                        >
                          <option value="pending">pending</option>
                          <option value="approved">approved</option>
                          <option value="rejected">rejected</option>
                        </select>
                        <input
                          name="notes"
                          defaultValue={d.notes || ""}
                          placeholder="Notes"
                          className="w-full rounded border px-2 py-1 text-xs"
                        />
                        <button type="submit" className="text-xs text-blue-700 underline">
                          Save
                        </button>
                      </form>
                    </td>
                    <td className="px-3 py-3">
                      <form action={deleteAction}>
                        <input type="hidden" name="driverId" value={d.id} />
                        <button type="submit" className="text-xs text-red-700 underline">
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
