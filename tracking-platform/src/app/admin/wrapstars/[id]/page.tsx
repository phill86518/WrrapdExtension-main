import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { listOrdersForWrapstar } from "@/lib/data";
import { findWrapstarById, updateWrapstar } from "@/lib/wrapstar-registry";
import { getWrapstarProfile } from "@/lib/wrapstar-profiles";
import { normalizeOrderStatus } from "@/lib/types";
import { AdminNav } from "@/components/admin-nav";
import {
  createPayoutBatch,
  formatUsdCents,
  listEarningsForWrapstar,
  listPayouts,
  walletForWrapstar,
} from "@/lib/finance";

export const dynamic = "force-dynamic";

async function updateProfileAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const id = String(formData.get("wrapstarId") || "");
  await updateWrapstar(id, {
    name: String(formData.get("name") || ""),
    homePostalCode: String(formData.get("homePostalCode") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
  });
  revalidatePath(`/admin/wrapstars/${id}`);
  revalidatePath("/admin/wrapstars");
}

async function payoutAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const id = String(formData.get("wrapstarId") || "");
  await createPayoutBatch(id);
  revalidatePath(`/admin/wrapstars/${id}`);
  revalidatePath("/admin/finance");
  redirect(`/admin/wrapstars/${id}`);
}

export default async function AdminWrapstarDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();
  const { id } = await params;
  const wrapstar = await findWrapstarById(id);
  if (!wrapstar) notFound();

  const [profile, orders, earnings, wallet, payouts] = await Promise.all([
    getWrapstarProfile(id),
    listOrdersForWrapstar(id),
    listEarningsForWrapstar(id),
    walletForWrapstar(id),
    listPayouts(),
  ]);
  const myPayouts = payouts.filter((p) => p.wrapstarId === id);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <AdminNav current="/admin/wrapstars" />
      <Link href="/admin/wrapstars" className="text-sm text-blue-700 underline">
        Back to WrapStars
      </Link>
      <h1 className="mt-3 text-3xl font-semibold text-slate-900">{wrapstar.name}</h1>
      <p className="font-mono text-sm text-slate-600">{wrapstar.displayId || wrapstar.id}</p>
      <p className="mt-1 text-sm text-slate-600">
        Onboarding: <strong>{profile.onboardingStatus}</strong>
        {profile.notes ? ` · ${profile.notes}` : ""}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase text-slate-500">Open / total orders</p>
          <p className="mt-1 text-2xl font-semibold">
            {
              orders.filter((o) => !["delivered", "cancelled", "refunded"].includes(normalizeOrderStatus(o.status)))
                .length
            }{" "}
            / {orders.length}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase text-slate-500">Unpaid wallet</p>
          <p className="mt-1 text-2xl font-semibold">{formatUsdCents(wallet.unpaidCents)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase text-slate-500">Lifetime paid</p>
          <p className="mt-1 text-2xl font-semibold">{formatUsdCents(wallet.paidCents)}</p>
        </div>
      </div>

      <section className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Profile</h2>
        <form action={updateProfileAction} className="mt-3 grid gap-3 md:grid-cols-2">
          <input type="hidden" name="wrapstarId" value={wrapstar.id} />
          <label className="text-sm">
            Name
            <input name="name" defaultValue={wrapstar.name} required className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">
            Home ZIP
            <input
              name="homePostalCode"
              defaultValue={wrapstar.homePostalCode}
              required
              pattern="[0-9]{5}"
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Email
            <input name="email" defaultValue={wrapstar.email || ""} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">
            Phone
            <input name="phone" defaultValue={wrapstar.phone || ""} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm text-white md:col-span-2 md:w-fit">
            Save profile
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Earnings & payouts</h2>
          <form action={payoutAction}>
            <input type="hidden" name="wrapstarId" value={wrapstar.id} />
            <button
              type="submit"
              className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              disabled={wallet.unpaidCount === 0}
            >
              Create payout batch ({wallet.unpaidCount} unpaid)
            </button>
          </form>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1 pr-3">Earned</th>
                <th className="py-1 pr-3">Order</th>
                <th className="py-1 pr-3">Net</th>
                <th className="py-1 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {earnings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-slate-500">
                    No earnings yet (created when orders are marked delivered).
                  </td>
                </tr>
              ) : (
                earnings.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3 text-xs">{e.earnedAt.slice(0, 10)}</td>
                    <td className="py-2 pr-3">
                      <Link href={`/admin/orders/${e.orderId}`} className="text-blue-700 underline">
                        {e.orderId}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{formatUsdCents(e.netCents)}</td>
                    <td className="py-2 pr-3">{e.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {myPayouts.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold">Payout batches</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {myPayouts.map((p) => (
                <li key={p.id}>
                  {p.id} · {p.status} · {formatUsdCents(p.netCents)}
                  {p.paidAt ? ` · paid ${p.paidAt.slice(0, 10)}` : ""}
                  {" · "}
                  <Link href={`/admin/finance?payout=${p.id}`} className="text-blue-700 underline">
                    Finance
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="mt-6 overflow-x-auto rounded-xl border bg-white shadow-sm">
        <div className="border-b px-4 py-3 font-semibold">Orders ({orders.length})</div>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Giftee</th>
              <th className="px-3 py-2">ZIP</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <Link href={`/admin/orders/${o.id}`} className="text-blue-700 underline">
                    {o.externalOrderId || o.id}
                  </Link>
                </td>
                <td className="px-3 py-2">{o.recipientName}</td>
                <td className="px-3 py-2">{o.postalCode}</td>
                <td className="px-3 py-2">{normalizeOrderStatus(o.status)}</td>
                <td className="px-3 py-2 text-xs">{o.updatedAt.slice(0, 16)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
