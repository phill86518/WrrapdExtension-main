import { getSession } from "@/lib/auth";
import { listWrapstarOrders, listWrapstarPastOrders } from "@/lib/data";
import { DriverConsole } from "@/components/driver-console";
import { DriverInstallCard } from "@/components/driver-install-card";
import { DriverLoginForm } from "@/components/driver-login-form";
import { DriverAccountPanel } from "@/components/driver-account-panel";
import { getWrapstarProfile } from "@/lib/wrapstar-profiles";
import {
  availabilityDeadlineForWeekMonday,
  getWeekAvailability,
  upcomingWeekFromToday,
} from "@/lib/availability-store";
import { WrrapdLogo } from "@/components/wrrapd-logo";
import { formatInTimeZone } from "date-fns-tz";
import { formatDateKeyNy, initialDriverDayKeyNy } from "@/lib/ny-date";
import { wrrapdScheduledInstantIsoForUi } from "@/lib/order-schedule-display";
import type { DayShiftAvailability } from "@/lib/types";
import { founderWrapstarId } from "@/lib/wrapstar-registry";
import { WrapstarAppShell } from "@/components/wrapstar/wrapstar-app-shell";
import { ShiftModule } from "@/components/wrapstar/shift-module";
import { WrapstarEarningsPanel } from "@/components/wrapstar/wrapstar-earnings-panel";
import { WrapstarHelpPanel } from "@/components/wrapstar/wrapstar-help-panel";
import { WrapstarAvailabilitySection } from "@/components/wrapstar/wrapstar-availability-section";
import { listEarningsForWrapstar, walletForWrapstar } from "@/lib/finance";

export const dynamic = "force-dynamic";

const QUEUE_HELP = "Tap Today, a date, or the calendar to see wrap jobs for that day.";

function isWrapstarSession(role: string | undefined) {
  return role === "wrapstar";
}

export default async function WrapstarPage() {
  const session = await getSession();
  if (!session || !isWrapstarSession(session.role)) {
    return (
      <main className="mx-auto min-h-screen max-w-xl px-4 py-10">
        <WrrapdLogo className="h-14 w-auto max-w-[220px]" />
        <h1 className="mt-3 text-3xl font-semibold">WrapStar App Login</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to access your wrap queue and shifts.</p>
        <DriverLoginForm />
      </main>
    );
  }

  const orders = await listWrapstarOrders(session.userId);
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
  const pastOrdersRaw = await listWrapstarPastOrders(session.userId);
  const profile = await getWrapstarProfile(session.userId);
  const week = upcomingWeekFromToday();
  const existing = await getWeekAvailability(session.userId, week.weekStartMonday);
  let initialDays = Object.fromEntries(
    week.days.map((d) => {
      const v = existing?.days[d];
      const normalized: DayShiftAvailability =
        typeof v === "boolean"
          ? { morning: v, afternoon: v }
          : {
              morning: v?.morning === true,
              afternoon: v?.afternoon === true,
            };
      return [d, normalized];
    }),
  ) as Record<string, DayShiftAvailability>;

  if (session.userId === founderWrapstarId() || session.userId === "drv-1") {
    initialDays = Object.fromEntries(
      week.days.map((d) => [d, { morning: true, afternoon: true } as DayShiftAvailability]),
    ) as Record<string, DayShiftAvailability>;
  }
  const deadline = availabilityDeadlineForWeekMonday(week.weekStartMonday);
  const deadlineLabel = formatInTimeZone(deadline, "America/New_York", "EEE MMM d, h:mm a zzz");

  const pastOrdersForModal = pastOrdersRaw.map((o) => {
    return {
      internalId: o.id,
      publicOrderRef: o.externalOrderId?.trim() || o.id,
      recipientName: o.recipientName,
      addressLine1: o.addressLine1,
      city: o.city,
      state: o.state,
      postalCode: o.postalCode,
      status: o.status,
      updatedAtIso: o.updatedAt,
    };
  });

  const wallet = await walletForWrapstar(session.userId);
  const earnings = await listEarningsForWrapstar(session.userId);
  if (profile.onboardingStatus !== "approved") {
    return (
      <WrapstarAppShell
        wrapstarName={session.name}
        wrapstarId={session.userId}
        initialSection="account"
        installCard={null}
        today={
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Your onboarding status is <strong>{profile.onboardingStatus}</strong>. You cannot receive
            wrap jobs until approved by admin.
          </p>
        }
        shift={
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Shift tools unlock after admin approval.
          </p>
        }
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
        account={<DriverAccountPanel wrapstarId={session.userId} />}
        help={<WrapstarHelpPanel />}
      />
    );
  }

  return (
    <WrapstarAppShell
      wrapstarName={session.name}
      wrapstarId={session.userId}
      installCard={<DriverInstallCard />}
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
      account={<DriverAccountPanel wrapstarId={session.userId} />}
      help={<WrapstarHelpPanel />}
    />
  );
}
