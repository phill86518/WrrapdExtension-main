import { getSession } from "@/lib/auth";
import { listAllOrders } from "@/lib/data";
import { findDeliveryDriverById } from "@/lib/driver-registry";
import { CourierLoginForm } from "@/components/courier-login-form";
import { CourierDeliveryActions } from "@/components/courier-delivery-actions";
import { DriverInstallCard } from "@/components/driver-install-card";
import { LogoutButton } from "@/components/logout-button";
import { WrrapdLogo } from "@/components/wrrapd-logo";
import { wrapPhaseLabel } from "@/lib/wrap-status-display";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CourierPage() {
  const session = await getSession();
  if (!session || session.role !== "driver") {
    return (
      <main className="mx-auto min-h-screen max-w-xl px-4 py-10">
        <WrrapdLogo className="h-14 w-auto max-w-[220px]" />
        <h1 className="mt-3 text-3xl font-semibold">Driver Console Login</h1>
        <p className="mt-2 text-sm text-slate-600">
          Courier final-mile app — separate from the WrapStar wrapping app.
        </p>
        <CourierLoginForm />
      </main>
    );
  }

  const driver = await findDeliveryDriverById(session.userId);
  if (!driver) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <p className="text-sm text-rose-700">
          This account is not a registered courier Driver. Use the WrapStar app at{" "}
          <Link href="/wrapstar" className="underline">
            /wrapstar
          </Link>
          .
        </p>
        <div className="mt-4">
          <LogoutButton redirectPath="/courier" />
        </div>
      </main>
    );
  }

  const orders = await listAllOrders();
  const mine = orders
    .filter((o) => o.courierDriverId === driver.id)
    .sort((a, b) => (b.readyForCourierAt || "").localeCompare(a.readyForCourierAt || ""));

  const ready = mine.filter((o) => o.wrapPhase === "complete" || o.readyForCourierAt);
  const waiting = mine.filter((o) => !ready.includes(o));

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <WrrapdLogo className="h-12 w-auto max-w-[200px]" />
          <h1 className="mt-2 text-2xl font-semibold">Driver Console</h1>
          <p className="text-sm text-slate-600">
            {driver.name} · <span className="font-mono text-xs">{driver.displayId || driver.id}</span>
          </p>
        </div>
        <LogoutButton redirectPath="/courier" />
      </div>

      <div className="mb-6">
        <DriverInstallCard variant="driver" />
      </div>

      <section className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
        <h2 className="text-lg font-semibold text-emerald-950">Ready for pickup</h2>
        <p className="mt-1 text-xs text-emerald-900">
          WrapStar finished wrapping — scan the box QR for delivery details.
        </p>
        <ul className="mt-3 space-y-3">
          {ready.length === 0 ? (
            <li className="text-sm text-slate-600">No wrap-complete jobs yet.</li>
          ) : (
            ready.map((o) => (
              <li key={o.id} className="rounded-lg border border-emerald-200 bg-white p-3 text-sm">
                <p className="font-semibold">{o.externalOrderId || o.id}</p>
                <p className="text-slate-700">
                  {o.recipientName} · {o.addressLine1}, {o.city}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Wrap: {wrapPhaseLabel(o.wrapPhase)}
                  {o.readyForCourierAt
                    ? ` · ready ${new Date(o.readyForCourierAt).toLocaleString()}`
                    : ""}
                </p>
                {o.driverLabelToken ? (
                  <a
                    className="mt-2 inline-block text-xs font-semibold text-blue-700 underline"
                    href={`/api/driver/scan/${o.driverLabelToken}`}
                  >
                    Open scan details
                  </a>
                ) : (
                  <p className="mt-2 text-xs text-amber-800">Label QR not generated yet.</p>
                )}
                <CourierDeliveryActions orderId={o.id} status={o.status} />
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Assigned — still wrapping</h2>
        <ul className="mt-3 space-y-2">
          {waiting.length === 0 ? (
            <li className="text-sm text-slate-600">None.</li>
          ) : (
            waiting.map((o) => (
              <li key={o.id} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <span className="font-medium">{o.externalOrderId || o.id}</span>
                <span className="ml-2 text-xs text-slate-500">{wrapPhaseLabel(o.wrapPhase)}</span>
              </li>
            ))
          )}
        </ul>
      </section>
    </main>
  );
}
