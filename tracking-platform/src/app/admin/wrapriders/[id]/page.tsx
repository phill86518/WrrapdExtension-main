import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { listOrdersForCourier, listOrdersForWrapstar } from "@/lib/data";
import { findWrapriderById, updateWraprider } from "@/lib/wraprider-registry";
import { listMetros } from "@/lib/metros";
import type { MetroId, OnboardingStatus } from "@/lib/types";
import { normalizeOrderStatus } from "@/lib/types";
import { WRAPRIDER_LABEL } from "@/lib/role-labels";
import { formatDateTimeNy } from "@/lib/ny-date";
import { getPayoutHold } from "@/lib/finance";
import { setPayoutHoldAction } from "../../payout-hold-action";

export const dynamic = "force-dynamic";

async function updateAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const id = String(formData.get("wrapriderId") || "");
  const { parseHourlyRateDollarsInput } = await import("@/lib/hourly-rates");
  const rateCents = parseHourlyRateDollarsInput(formData.get("hourlyRateDollars"));
  await updateWraprider(id, {
    name: String(formData.get("name") || ""),
    homePostalCode: String(formData.get("homePostalCode") || ""),
    metroId: String(formData.get("metroId") || "") as MetroId,
    status: String(formData.get("status") || "pending") as OnboardingStatus,
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    notes: String(formData.get("notes") || ""),
    vehicleType: String(formData.get("vehicleType") || "") || undefined,
    ...(rateCents ? { hourlyRateCents: rateCents } : {}),
  });
  revalidatePath(`/admin/wrapriders/${id}`);
  revalidatePath("/admin/wrapriders");
  redirect(`/admin/wrapriders/${id}`);
}

export default async function AdminWrapriderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();
  const { id } = await params;
  const wraprider = await findWrapriderById(id);
  if (!wraprider) notFound();
  const metros = listMetros();
  const [ownHold, linkedHold] = await Promise.all([
    getPayoutHold(wraprider.id),
    wraprider.wrapstarId ? getPayoutHold(wraprider.wrapstarId) : Promise.resolve(null),
  ]);
  const payoutHold = ownHold?.held ? ownHold : linkedHold?.held ? linkedHold : ownHold || linkedHold;

  const wrapOrders = wraprider.wrapstarId ? await listOrdersForWrapstar(wraprider.wrapstarId) : [];
  const deliverOrders = wraprider.courierDriverId
    ? await listOrdersForCourier(wraprider.courierDriverId)
    : [];
  const byId = new Map([...wrapOrders, ...deliverOrders].map((o) => [o.id, o]));
  const orders = [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const open = orders.filter((o) => {
    const st = normalizeOrderStatus(o.status);
    return !["delivered", "cancelled", "refunded"].includes(st);
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/wrapriders" className="text-sm text-amber-800 underline">
        Back to {WRAPRIDER_LABEL}s
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-slate-900">{wraprider.name}</h1>
      <p className="font-mono text-sm text-slate-600">{wraprider.displayId || wraprider.id}</p>
      <p className="mt-1 text-xs text-slate-500">
        {WRAPRIDER_LABEL} — wrap and deliver. App: wraprider.wrrapd.com (own login)
      </p>
      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
        Open orders: <strong>{open.length}</strong> · lifetime unique: <strong>{orders.length}</strong>
        {wraprider.wrapstarId ? (
          <>
            {" "}
            · wrap capacity id <span className="font-mono">{wraprider.wrapstarId}</span>
          </>
        ) : null}
        {wraprider.courierDriverId ? (
          <>
            {" "}
            · delivery capacity id <span className="font-mono">{wraprider.courierDriverId}</span>
          </>
        ) : null}
      </p>

      <form action={updateAction} className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <input type="hidden" name="wrapriderId" value={wraprider.id} />
        <label className="block text-sm">
          Name
          <input
            name="name"
            defaultValue={wraprider.name}
            required
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Home ZIP
          <input
            name="homePostalCode"
            defaultValue={wraprider.homePostalCode}
            required
            pattern="[0-9]{5}"
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Metro
          <select name="metroId" defaultValue={wraprider.metroId || ""} className="mt-1 w-full rounded border px-3 py-2">
            <option value="">—</option>
            {metros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Status
          <select name="status" defaultValue={wraprider.status} className="mt-1 w-full rounded border px-3 py-2">
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
          </select>
        </label>
        <label className="block text-sm">
          Email
          <input
            name="email"
            type="email"
            defaultValue={wraprider.email || ""}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Phone
          <input name="phone" defaultValue={wraprider.phone || ""} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <label className="block text-sm">
          Vehicle type
          <input
            name="vehicleType"
            defaultValue={wraprider.vehicleType || ""}
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
              wraprider.hourlyRateCents ? (wraprider.hourlyRateCents / 100).toFixed(2) : "30.00"
            }
            className="mt-1 w-full rounded border px-3 py-2"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Person rate set at onboarding. Change here to override for this WrapRider.
          </span>
        </label>
        <label className="block text-sm">
          Notes
          <textarea
            name="notes"
            defaultValue={wraprider.notes || ""}
            rows={3}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded bg-amber-800 px-4 py-2 text-sm text-white">
          Save {WRAPRIDER_LABEL}
        </button>
      </form>

      <form action={setPayoutHoldAction} className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <input type="hidden" name="contractorId" value={wraprider.id} />
        {wraprider.wrapstarId ? <input type="hidden" name="alsoId" value={wraprider.wrapstarId} /> : null}
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

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Orders (wrap + deliver)</h2>
        {orders.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No released orders yet.</p>
        ) : (
          <ul className="mt-3 divide-y text-sm">
            {orders.slice(0, 40).map((o) => (
              <li key={o.id} className="py-2">
                <Link href={`/admin/orders/${o.id}`} className="font-medium text-blue-700 underline">
                  {o.id}
                </Link>
                <span className="ml-2 text-slate-600">{normalizeOrderStatus(o.status)}</span>
                <span className="ml-2 text-xs text-slate-400">{formatDateTimeNy(o.updatedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
