import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  listOrdersForWrapstar,
  listWrapstars,
  unassignDeletedWrapstarOrders,
} from "@/lib/data";
import {
  addWrapstar,
  deleteWrapstar,
  founderWrapstarId,
} from "@/lib/wrapstar-registry";
import {
  readWrapstarProfiles,
  setForcedAvailableDates,
  setOnboardingStatus,
} from "@/lib/wrapstar-profiles";
import type { OnboardingStatus } from "@/lib/types";
import { normalizeOrderStatus } from "@/lib/types";
import { AdminNav } from "@/components/admin-nav";
import { formatUsdCents, listEarnings, walletForWrapstar } from "@/lib/finance";

export const dynamic = "force-dynamic";

async function addAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const name = String(formData.get("name") || "");
  const homePostalCode = String(formData.get("homePostalCode") || "");
  const email = String(formData.get("email") || "");
  const phone = String(formData.get("phone") || "");
  await addWrapstar({ name, homePostalCode, email, phone });
  revalidatePath("/admin/wrapstars");
  redirect("/admin/wrapstars");
}

async function deleteAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const id = String(formData.get("wrapstarId") || "");
  const res = await deleteWrapstar(id);
  if (res.ok) await unassignDeletedWrapstarOrders(id);
  revalidatePath("/admin/wrapstars");
  revalidatePath("/admin/orders");
}

async function statusAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const id = String(formData.get("wrapstarId") || "");
  const status = String(formData.get("status") || "pending") as OnboardingStatus;
  const notes = String(formData.get("notes") || "");
  await setOnboardingStatus(id, status, notes);
  revalidatePath("/admin/wrapstars");
}

async function forceDatesAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const id = String(formData.get("wrapstarId") || "");
  const raw = String(formData.get("forcedDates") || "");
  const dates = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
  await setForcedAvailableDates(id, dates);
  revalidatePath("/admin/wrapstars");
}

export default async function AdminWrapstarsPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();

  const [wrapstars, profiles, allEarnings] = await Promise.all([
    listWrapstars(),
    readWrapstarProfiles(),
    listEarnings(),
  ]);

  const rows = await Promise.all(
    wrapstars.map(async (w) => {
      const orders = await listOrdersForWrapstar(w.id);
      const open = orders.filter((o) => {
        const st = normalizeOrderStatus(o.status);
        return !["delivered", "cancelled", "refunded"].includes(st);
      }).length;
      const wallet = await walletForWrapstar(w.id);
      const p = profiles[w.id] ?? {
        wrapstarId: w.id,
        onboardingStatus: "pending" as const,
      };
      return { w, p, open, lifetime: orders.length, wallet };
    }),
  );

  void allEarnings;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <AdminNav current="/admin/wrapstars" />
      <h1 className="text-2xl font-semibold text-slate-900">WrapStars</h1>
      <p className="mt-1 text-sm text-slate-600">
        Directory of WrapStars with order counts and wallet balances. Click an ID for full detail.
      </p>

      <form action={addAction} className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
        <input name="name" placeholder="Name" required className="rounded border px-3 py-2 text-sm" />
        <input
          name="homePostalCode"
          placeholder="Home ZIP"
          required
          pattern="[0-9]{5}"
          className="rounded border px-3 py-2 text-sm"
        />
        <input name="email" placeholder="Email" type="email" className="rounded border px-3 py-2 text-sm" />
        <input name="phone" placeholder="Phone" className="rounded border px-3 py-2 text-sm" />
        <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm text-white">
          Add WrapStar
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Home ZIP</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Open orders</th>
              <th className="px-3 py-2">Lifetime</th>
              <th className="px-3 py-2">Unpaid</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ w, p, open, lifetime, wallet }) => (
              <tr key={w.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-3 font-mono text-xs">
                  <Link href={`/admin/wrapstars/${w.id}`} className="text-blue-700 underline">
                    {w.displayId || w.id}
                  </Link>
                </td>
                <td className="px-3 py-3 font-medium">{w.name}</td>
                <td className="px-3 py-3">{w.homePostalCode}</td>
                <td className="px-3 py-3">
                  <form action={statusAction} className="space-y-1">
                    <input type="hidden" name="wrapstarId" value={w.id} />
                    <select
                      name="status"
                      defaultValue={p.onboardingStatus}
                      className="rounded border px-2 py-1 text-xs"
                    >
                      <option value="pending">pending</option>
                      <option value="approved">approved</option>
                      <option value="rejected">rejected</option>
                    </select>
                    <input
                      name="notes"
                      defaultValue={p.notes || ""}
                      placeholder="Notes"
                      className="w-full rounded border px-2 py-1 text-xs"
                    />
                    <button type="submit" className="text-xs text-blue-700 underline">
                      Save
                    </button>
                  </form>
                </td>
                <td className="px-3 py-3">{open}</td>
                <td className="px-3 py-3">{lifetime}</td>
                <td className="px-3 py-3">{formatUsdCents(wallet.unpaidCents)}</td>
                <td className="px-3 py-3 space-y-2">
                  <form action={forceDatesAction} className="space-y-1">
                    <input type="hidden" name="wrapstarId" value={w.id} />
                    <input
                      name="forcedDates"
                      defaultValue={(p.forcedAvailableDates || []).join(", ")}
                      placeholder="Force dates YYYY-MM-DD"
                      className="w-40 rounded border px-2 py-1 text-xs"
                    />
                    <button type="submit" className="block text-xs text-blue-700 underline">
                      Save forced dates
                    </button>
                  </form>
                  {w.id !== founderWrapstarId() ? (
                    <form action={deleteAction}>
                      <input type="hidden" name="wrapstarId" value={w.id} />
                      <button type="submit" className="text-xs text-red-700 underline">
                        Delete
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-slate-400">Founder protected</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
