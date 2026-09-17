import Link from "next/link";
import { getSession } from "@/lib/auth";
import { listAllOrders, listWrapstarOrders, listWrapstarPastOrders } from "@/lib/data";
import { findWrapriderById } from "@/lib/wraprider-registry";
import { DriverConsole } from "@/components/driver-console";
import { DriverInstallCard } from "@/components/driver-install-card";
import { WrapriderLoginForm } from "@/components/wraprider-login-form";
import { LogoutButton } from "@/components/logout-button";
import { CourierDeliveryActions } from "@/components/courier-delivery-actions";
import {
  availabilityDeadlineForWeekMonday,
  getWeekAvailability,
  upcomingWeekFromToday,
} from "@/lib/availability-store";
import { WrrapdLogo } from "@/components/wrrapd-logo";
import { formatInTimeZone } from "date-fns-tz";
import { formatDateKeyNy, initialDriverDayKeyNy } from "@/lib/ny-date";
import { wrrapdScheduledInstantIsoForUi } from "@/lib/order-schedule-display";
import { isAllocationReleasedToModules, type DayShiftAvailability } from "@/lib/types";
import { wrapPhaseLabel } from "@/lib/wrap-status-display";
import { WrapstarAppShell } from "@/components/wrapstar/wrapstar-app-shell";
import { ShiftModule } from "@/components/wrapstar/shift-module";
import { WrapstarEarningsPanel } from "@/components/wrapstar/wrapstar-earnings-panel";
import { WrapstarHelpPanel } from "@/components/wrapstar/wrapstar-help-panel";
import { WrapstarAvailabilitySection } from "@/components/wrapstar/wrapstar-availability-section";
import { listEarningsForWrapstar, walletForWrapstar } from "@/lib/finance";
import { getContractorRecord } from "@/lib/contractor-records";
import { ContractorAccountCard } from "@/components/contractor-account-card";
import { WRAPRIDER_LABEL } from "@/lib/role-labels";

export const dynamic = "force-dynamic";

const QUEUE_HELP = "Tap Today, a date, or the calendar to see wrap jobs for that day. Deliveries are under Deliveries.";

/**
 * WrapRider App (wraprider.wrrapd.com) — the THIRD contractor app. Own login (role `wraprider`),
 * own roster id (6…), own contractor record. Wrap tooling keys on the linked wrap-capacity id and
 * delivery tooling on the linked delivery-capacity id; the person is never a WrapStar/JoyRider session.
 */
export default async function WrapriderPage() {
  const session = await getSession();
  if (!session || session.role !== "wraprider") {
    return (
      <main className="mx-auto min-h-screen max-w-xl px-4 py-10">
        <WrrapdLogo className="h-14 w-auto max-w-[220px]" />
        <h1 className="mt-3 text-3xl font-semibold">{WRAPRIDER_LABEL} App Login</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to see your wrap jobs and deliveries.</p>
        <WrapriderLoginForm />
      </main>
    );
  }

  const wraprider = await findWrapriderById(session.userId);
  if (!wraprider) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <p className="text-sm text-rose-700">
          This account is not on the {WRAPRIDER_LABEL} roster. Please contact Wrrapd support.
        </p>
        <div className="mt-4">
          <LogoutButton redirectPath="/wraprider" />
        </div>
      </main>
    );
  }

  const wrapId = wraprider.wrapstarId;
  const deliverId = wraprider.courierDriverId;
  const contractor = await getContractorRecord("wraprider", wraprider.id).catch(() => null);
  const accountPanel = <ContractorAccountCard record={contractor} roleLabel="WrapRider" />;

  const notReady = (
    <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      Your {WRAPRIDER_LABEL} account is <strong>{wraprider.status}</strong>. Job tools unlock after
      Wrrapd approves your onboarding.
    </p>
  );

  if (wraprider.status !== "approved" || !wrapId) {
    return (
      <WrapstarAppShell
        appLabel="WrapRider"
        logoutPath="/wraprider"
        wrapstarName={wraprider.name}
        wrapstarId={wraprider.displayId || wraprider.id}
        initialSection="account"
        installCard={null}
        today={notReady}
        shift={notReady}
        deliveries={notReady}
        availability={notReady}
        earnings={notReady}
        account={accountPanel}
        help={<WrapstarHelpPanel />}
      />
    );
  }

  // Wrap side — keyed on the linked wrap-capacity id (what allocation assigns to).
  const orders = await listWrapstarOrders(wrapId);
  const ordersForConsole = orders.map((o) => ({
    id: o.id,
    publicOrderRef: o.externalOrderId?.trim() || o.id,
    recipientName: o.recipientName,
    addressLine1: o.addressLine1,
    city: o.city,
    state: o.state,
    postalCode: o.postalCode,
    status: o.status,
    stopSequence: o.stopSequence,
    scheduledFor: wrrapdScheduledInstantIsoForUi(o),
  }));
  const todayNyKey = formatDateKeyNy(new Date());
  const initialDriverDayKey = initialDriverDayKeyNy(todayNyKey, ordersForConsole);
  const pastOrdersRaw = await listWrapstarPastOrders(wrapId);
  const week = upcomingWeekFromToday();
  const existing = await getWeekAvailability(wrapId, week.weekStartMonday);
  const initialDays = Object.fromEntries(
    week.days.map((d) => {
      const v = existing?.days[d];
      const normalized: DayShiftAvailability =
        typeof v === "boolean"
          ? { morning: v, afternoon: v }
          : { morning: v?.morning === true, afternoon: v?.afternoon === true };
      return [d, normalized];
    }),
  ) as Record<string, DayShiftAvailability>;
  const deadline = availabilityDeadlineForWeekMonday(week.weekStartMonday);
  const deadlineLabel = formatInTimeZone(deadline, "America/New_York", "EEE MMM d, h:mm a zzz");
  const pastOrdersForModal = pastOrdersRaw.map((o) => ({
    internalId: o.id,
    publicOrderRef: o.externalOrderId?.trim() || o.id,
    recipientName: o.recipientName,
    addressLine1: o.addressLine1,
    city: o.city,
    state: o.state,
    postalCode: o.postalCode,
    status: o.status,
    updatedAtIso: o.updatedAt,
  }));
  const wallet = await walletForWrapstar(wrapId);
  const earnings = await listEarningsForWrapstar(wrapId);

  // Delivery side — keyed on the linked delivery-capacity id.
  const all = deliverId ? await listAllOrders() : [];
  const mine = all
    .filter((o) => isAllocationReleasedToModules(o) && o.courierDriverId === deliverId)
    .sort((a, b) => (b.readyForCourierAt || "").localeCompare(a.readyForCourierAt || ""));
  const ready = mine.filter((o) => o.wrapPhase === "complete" || o.readyForCourierAt);
  const waiting = mine.filter((o) => !ready.includes(o));
  const delivered = mine.filter((o) => o.status === "delivered");

  const deliveriesPanel = (
    <div className="space-y-4">
      <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
        <h2 className="text-lg font-semibold text-emerald-950">Ready for delivery</h2>
        <p className="mt-1 text-xs text-emerald-900">Wrapping is finished — scan the box QR for delivery details.</p>
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
                  {o.readyForCourierAt ? ` · ready ${new Date(o.readyForCourierAt).toLocaleString()}` : ""}
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

      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-lg font-semibold text-slate-900">
          Delivery history{delivered.length ? ` (${delivered.length})` : ""}
        </summary>
        <ul className="mt-3 space-y-2">
          {delivered.length === 0 ? (
            <li className="text-sm text-slate-600">No completed deliveries yet.</li>
          ) : (
            delivered.slice(0, 50).map((o) => (
              <li key={o.id} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <span className="font-medium">{o.externalOrderId || o.id}</span>
                <span className="ml-2 text-xs text-slate-500">
                  {o.recipientName} · {o.city}
                  {o.updatedAt ? ` · ${new Date(o.updatedAt).toLocaleDateString()}` : ""}
                </span>
              </li>
            ))
          )}
        </ul>
      </details>
      {!deliverId ? (
        <p className="text-xs text-slate-500">
          Delivery assignments appear once Wrrapd finishes setting up your account.{" "}
          <Link href="/wraprider" className="underline">
            Refresh
          </Link>
        </p>
      ) : null}
    </div>
  );

  return (
    <WrapstarAppShell
      appLabel="WrapRider"
      logoutPath="/wraprider"
      wrapstarName={wraprider.name}
      wrapstarId={wraprider.displayId || wraprider.id}
      installCard={<DriverInstallCard variant="wraprider" />}
      today={
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-center text-[11px] text-slate-400">
            <span className="font-mono text-slate-500">{process.env.K_REVISION ?? "local"}</span>
          </p>
          <DriverConsole
            todayNyKey={todayNyKey}
            initialSelectedDayKey={initialDriverDayKey}
            description={QUEUE_HELP}
            orders={ordersForConsole}
          />
        </section>
      }
      shift={<ShiftModule />}
      deliveries={deliveriesPanel}
      availability={
        <WrapstarAvailabilitySection
          weekStartMonday={week.weekStartMonday}
          days={week.days}
          initialDays={initialDays}
          deadlineLabel={deadlineLabel}
          pastOrders={pastOrdersForModal}
        />
      }
      earnings={
        <WrapstarEarningsPanel
          unpaidCents={wallet.unpaidCents}
          paidCents={wallet.paidCents}
          lifetimeCents={wallet.lifetimeCents}
          unpaidCount={wallet.unpaidCount}
          recent={earnings.map((e) => ({
            id: e.id,
            orderId: e.orderId,
            netCents: e.netCents,
            earnedAt: e.earnedAt,
            status: e.status,
          }))}
        />
      }
      account={accountPanel}
      help={<WrapstarHelpPanel />}
    />
  );
}
