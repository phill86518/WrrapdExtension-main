import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { listOrdersForCourier, listOrdersForWrapstar } from "@/lib/data";
import {
  addWraprider,
  deleteWraprider,
  listWrapriders,
  updateWraprider,
} from "@/lib/wraprider-registry";
import { listMetros, metroForPostalCode } from "@/lib/metros";
import type { MetroId, OnboardingStatus } from "@/lib/types";
import { normalizeOrderStatus } from "@/lib/types";
import { WRAPRIDER_LABEL, WRAPRIDER_LABEL_PLURAL } from "@/lib/role-labels";

export const dynamic = "force-dynamic";

async function addAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const metroRaw = String(formData.get("metroId") || "");
  await addWraprider({
    name: String(formData.get("name") || ""),
    homePostalCode: String(formData.get("homePostalCode") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    metroId: metroRaw ? (metroRaw as MetroId) : undefined,
    status: "pending",
  });
  revalidatePath("/admin/wrapriders");
  redirect("/admin/wrapriders");
}

async function deleteAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const id = String(formData.get("wrapriderId") || "");
  await deleteWraprider(id);
  revalidatePath("/admin/wrapriders");
}

async function statusAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const id = String(formData.get("wrapriderId") || "");
  const status = String(formData.get("status") || "pending") as OnboardingStatus;
  const notes = String(formData.get("notes") || "");
  await updateWraprider(id, { status, notes });
  revalidatePath("/admin/wrapriders");
}

export default async function AdminWrapridersPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();

  const [wrapriders, metros] = await Promise.all([listWrapriders(), Promise.resolve(listMetros())]);

  const rows = await Promise.all(
    wrapriders.map(async (w) => {
      const wrapOrders = w.wrapstarId ? await listOrdersForWrapstar(w.wrapstarId) : [];
      const deliverOrders = w.courierDriverId ? await listOrdersForCourier(w.courierDriverId) : [];
      const ids = new Set([...wrapOrders, ...deliverOrders].map((o) => o.id));
      const open = [...wrapOrders, ...deliverOrders].filter((o) => {
        const st = normalizeOrderStatus(o.status);
        return !["delivered", "cancelled", "refunded"].includes(st);
      }).length;
      return { w, open, lifetime: ids.size };
    }),
  );

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold text-slate-900">{WRAPRIDER_LABEL_PLURAL}</h1>
      <p className="mt-1 text-sm text-slate-600">
        Third hire category — wrap <em>and</em> deliver. IDs start with <strong>6</strong>. This is
        their home in Command Center. They do not appear on the WrapStars or JoyRiders boards.
        Applicants:{" "}
        <Link href="/admin/applications?role=wraprider" className="font-medium text-blue-700 underline">
          Applications → WrapRiders
        </Link>
        .
      </p>

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
        <button type="submit" className="rounded bg-amber-800 px-3 py-2 text-sm text-white">
          Add {WRAPRIDER_LABEL}
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-amber-50 text-xs uppercase text-amber-900">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Metro</th>
              <th className="px-3 py-2">Home ZIP</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Open / lifetime</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  No {WRAPRIDER_LABEL_PLURAL} yet. Activate a WrapRider application or add one above.
                </td>
              </tr>
            ) : (
              rows.map(({ w, open, lifetime }) => {
                const metro = metros.find((m) => m.id === w.metroId);
                const inferred = metroForPostalCode(w.homePostalCode);
                return (
                  <tr key={w.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-3 font-mono text-xs">
                      <Link href={`/admin/wrapriders/${w.id}`} className="text-amber-800 underline">
                        {w.displayId || w.id}
                      </Link>
                    </td>
                    <td className="px-3 py-3 font-medium">{w.name}</td>
                    <td className="px-3 py-3">{metro?.name || inferred?.name || w.metroId || "—"}</td>
                    <td className="px-3 py-3">{w.homePostalCode}</td>
                    <td className="px-3 py-3">
                      <form action={statusAction} className="space-y-1">
                        <input type="hidden" name="wrapriderId" value={w.id} />
                        <select
                          name="status"
                          defaultValue={w.status}
                          className="rounded border px-2 py-1 text-xs"
                        >
                          <option value="pending">pending</option>
                          <option value="approved">approved</option>
                          <option value="rejected">rejected</option>
                        </select>
                        <input
                          name="notes"
                          defaultValue={w.notes || ""}
                          placeholder="Notes"
                          className="w-full rounded border px-2 py-1 text-xs"
                        />
                        <button type="submit" className="text-xs text-blue-700 underline">
                          Save
                        </button>
                      </form>
                    </td>
                    <td className="px-3 py-3">
                      {open} / {lifetime}
                    </td>
                    <td className="px-3 py-3">
                      <form action={deleteAction}>
                        <input type="hidden" name="wrapriderId" value={w.id} />
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
