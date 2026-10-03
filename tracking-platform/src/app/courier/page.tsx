import { getSession } from "@/lib/auth";
import { listAllOrders } from "@/lib/data";
import { findDeliveryDriverById } from "@/lib/driver-registry";
import { PortalLogin } from "@/components/portal-login";
import { CourierDeliveryActions } from "@/components/courier-delivery-actions";
import { DriverInstallCard } from "@/components/driver-install-card";
import { LogoutButton } from "@/components/logout-button";
import { WrapstarAppShell } from "@/components/wrapstar/wrapstar-app-shell";
import { wrapPhaseLabel } from "@/lib/wrap-status-display";
import { isAllocationReleasedToModules, type DayShiftAvailability } from "@/lib/types";
import { getContractorRecord } from "@/lib/contractor-records";
import { ContractorAccountCard } from "@/components/contractor-account-card";
import { ContractorPayCard } from "@/components/contractor-pay-card";
import { ContractorPayHistory } from "@/components/contractor-pay-history";
import { DriverAvailabilityPanel } from "@/components/driver-availability-panel";
import {
  availabilityDeadlineForWeekMonday,
  getWeekAvailability,
  upcomingWeekFromToday,
} from "@/lib/availability-store";
import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CourierPage() {
  const session = await getSession();
  if (!session || session.role !== "driver") {
    return (
      <PortalLogin
        appName="JoyRider"
        iconSrc="/icons/app-joyrider-512.png"
        action="/api/courier/login"
        redirectTo="/courier"
        blurb="Sign in to your pickups and deliveries."
        portal="driver"
      />
    );
  }

  const driver = await findDeliveryDriverById(session.userId);
  if (!driver) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <p className="text-sm text-rose-700">
          This account is not a registered JoyRider. Use the WrapStar app at{" "}
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
    .filter((o) => isAllocationReleasedToModules(o) && o.courierDriverId === driver.id)
    .sort((a, b) => (b.readyForCourierAt || "").localeCompare(a.readyForCourierAt || ""));

  const ready = mine.filter((o) => o.wrapPhase === "complete" || o.readyForCourierAt);
  const waiting = mine.filter((o) => !ready.includes(o));
  const delivered = mine.filter((o) => o.status === "delivered");
  const contractor = await getContractorRecord("driver", driver.id).catch(() => null);

  const week = upcomingWeekFromToday();
  const existing = await getWeekAvailability(driver.id, week.weekStartMonday);
  const initialDays = Object.fromEntries(
    week.days.map((d) => {
      const raw = existing?.days?.[d];
      if (typeof raw === "boolean") return [d, { morning: raw, afternoon: raw }];
      if (raw && typeof raw === "object") {
        return [d, { morning: raw.morning === true, afternoon: raw.afternoon === true }];
      }
      return [d, { morning: false, afternoon: false }];
    }),
  ) as Record<string, DayShiftAvailability>;
  const deadline = availabilityDeadlineForWeekMonday(week.weekStartMonday);
  const deadlineLabel = formatInTimeZone(deadline, "America/New_York", "EEE MMM d, h:mm a zzz");

  return (
    <WrapstarAppShell
      appLabel="JoyRider"
      logoutPath="/courier"
      wrapstarName={driver.name}
      wrapstarId={driver.displayId || driver.id}
      installCard={<DriverInstallCard variant="driver" />}
      sections={["today", "shift", "deliveries", "availability", "account"]}
      sectionLabels={{
        today: "Pickups",
        shift: "Still wrapping",
        deliveries: "History",
      }}
      today={
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <h2 className="text-2xl font-semibold text-emerald-950">Ready for pickup</h2>
          <p className="mt-2 text-lg text-emerald-900">
            The gift is wrapped. Scan the code on the box for the address and the time.
          </p>
          <ul className="mt-4 space-y-3">
            {ready.length === 0 ? (
              <li className="text-lg text-slate-600">No wrap-complete jobs yet.</li>
            ) : (
              ready.map((o) => (
                <li key={o.id} className="rounded-lg border border-emerald-200 bg-white p-4 text-lg">
                  <p className="font-semibold">{o.externalOrderId || o.id}</p>
                  <p className="text-slate-700">
                    {o.recipientName} · {o.addressLine1}, {o.city}
                  </p>
                  <p className="mt-1 text-base text-slate-500">
                    Wrap: {wrapPhaseLabel(o.wrapPhase)}
                    {o.readyForCourierAt
                      ? ` · ready ${new Date(o.readyForCourierAt).toLocaleString()}`
                      : ""}
                  </p>
                  {o.driverLabelToken ? (
                    <a
                      className="mt-3 inline-block text-lg font-semibold text-blue-700 underline"
                      href={`/api/driver/scan/${o.driverLabelToken}`}
                    >
                      Open scan details
                    </a>
                  ) : (
                    <p className="mt-3 text-base text-amber-800">Label code is not ready yet.</p>
                  )}
                  <CourierDeliveryActions orderId={o.id} status={o.status} />
                </li>
              ))
            )}
          </ul>
        </section>
      }
      shift={
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-2xl font-semibold text-slate-900">Still wrapping</h2>
          <ul className="mt-4 space-y-3">
            {waiting.length === 0 ? (
              <li className="text-lg text-slate-600">None.</li>
            ) : (
              waiting.map((o) => (
                <li key={o.id} className="rounded-lg border border-slate-100 px-4 py-3 text-lg">
                  <span className="font-medium">{o.externalOrderId || o.id}</span>
                  <span className="ml-2 text-base text-slate-500">{wrapPhaseLabel(o.wrapPhase)}</span>
                </li>
              ))
            )}
          </ul>
        </section>
      }
      deliveries={
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-2xl font-semibold text-slate-900">
            Delivery history{delivered.length ? ` (${delivered.length})` : ""}
          </h2>
          <ul className="mt-4 space-y-3">
            {delivered.length === 0 ? (
              <li className="text-lg text-slate-600">No completed deliveries yet.</li>
            ) : (
              delivered.slice(0, 50).map((o) => (
                <li key={o.id} className="rounded-lg border border-slate-100 px-4 py-3 text-lg">
                  <span className="font-medium">{o.externalOrderId || o.id}</span>
                  <span className="mt-1 block text-base text-slate-500">
                    {o.recipientName} · {o.city}
                    {o.updatedAt ? ` · ${new Date(o.updatedAt).toLocaleDateString()}` : ""}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      }
      availability={
        <DriverAvailabilityPanel
          weekStartMonday={week.weekStartMonday}
          days={week.days}
          initialDays={initialDays}
          deadlineLabel={deadlineLabel}
        />
      }
      earnings={
        <>
          <ContractorPayCard contractorId={driver.id} role="joyrider" showConnect />
          <ContractorPayHistory contractorId={driver.id} />
        </>
      }
      account={
        <section>
          <h2 className="mb-3 text-2xl font-semibold text-slate-900">Account</h2>
          <ContractorAccountCard record={contractor} roleLabel="JoyRider" />
        </section>
      }
      help={null}
    />
  );
}
