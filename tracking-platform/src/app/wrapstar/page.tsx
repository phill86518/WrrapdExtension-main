import { getSession } from "@/lib/auth";
import { listWrapstarOrders, listWrapstarPastOrders } from "@/lib/data";
import { DriverConsole } from "@/components/driver-console";
import { DriverInstallCard } from "@/components/driver-install-card";
import { DriverLoginForm } from "@/components/driver-login-form";
import { DriverAccountPanel } from "@/components/driver-account-panel";
import { LogoutButton } from "@/components/logout-button";
import { getWrapstarProfile } from "@/lib/wrapstar-profiles";
import {
  availabilityDeadlineForWeekMonday,
  getWeekAvailability,
  upcomingWeekFromToday,
} from "@/lib/availability-store";
import { DriverTopModals } from "@/components/driver-top-modals";
import { WrrapdLogo } from "@/components/wrrapd-logo";
import { formatInTimeZone } from "date-fns-tz";
import { formatDateKeyNy, initialDriverDayKeyNy } from "@/lib/ny-date";
import { wrrapdScheduledInstantIsoForUi } from "@/lib/order-schedule-display";
import type { DayShiftAvailability } from "@/lib/types";
import { founderWrapstarId } from "@/lib/wrapstar-registry";

export const dynamic = "force-dynamic";

const QUEUE_HELP = "Tap Today, a date, or the calendar to see stops for that day.";

function isWrapstarSession(role: string | undefined) {
  return role === "wrapstar" || role === "driver";
}

export default async function WrapstarPage() {
  const session = await getSession();
  if (!session || !isWrapstarSession(session.role)) {
    return (
      <main className="mx-auto min-h-screen max-w-xl px-4 py-10">
        <WrrapdLogo className="h-14 w-auto max-w-[220px]" />
        <h1 className="mt-3 text-3xl font-semibold">WrapStar Console Login</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to access your order queue.</p>
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

  // Founder WrapStar: always fully available for the upcoming week so routing can assign.
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

  if (profile.onboardingStatus !== "approved") {
    return (
      <main className="mx-auto max-w-xl px-4 py-8">
        <WrrapdLogo className="h-14 w-auto max-w-[220px]" />
        <h1 className="mt-3 text-3xl font-semibold">WrapStar Console</h1>
        <p className="mt-1 font-mono text-xs text-slate-500">ID {session.userId}</p>
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Your onboarding status is <strong>{profile.onboardingStatus}</strong>. You cannot receive
          deliveries until approved by admin.
        </p>
        <DriverTopModals
          weekStartMonday={week.weekStartMonday}
          days={week.days}
          initialDays={initialDays}
          deadlineLabel={deadlineLabel}
          pastOrders={pastOrdersForModal}
        />
        <div className="mt-4">
          <DriverAccountPanel wrapstarId={session.userId} />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <WrrapdLogo className="h-14 w-auto max-w-[220px]" />
          <h1 className="mt-2 text-3xl font-semibold">WrapStar Console</h1>
          <p className="text-sm text-slate-600">Welcome, {session.name}</p>
          <p className="font-mono text-xs text-slate-500">WrapStar ID {session.userId}</p>
        </div>
        <LogoutButton redirectPath="/wrapstar" />
      </div>
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        <a href="#orders" className="rounded-full bg-slate-900 px-3 py-1.5 text-white">
          Orders
        </a>
        <a href="#calendar" className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
          Calendar
        </a>
        <a href="#availability" className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
          Availability
        </a>
        <a href="#account" className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
          Account
        </a>
      </nav>
      <div id="availability">
        <DriverTopModals
          weekStartMonday={week.weekStartMonday}
          days={week.days}
          initialDays={initialDays}
          deadlineLabel={deadlineLabel}
          pastOrders={pastOrdersForModal}
        />
      </div>
      <div className="mb-4">
        <DriverInstallCard />
      </div>
      <div id="account">
        <DriverAccountPanel wrapstarId={session.userId} />
      </div>
      <p className="mb-2 text-center text-[11px] text-slate-400" data-wrrapd-wrapstar-build="queue-v1">
        <span className="font-mono text-slate-500">{process.env.K_REVISION ?? "local"}</span>
      </p>
      <section id="orders" className="mb-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div id="calendar">
          <DriverConsole
            todayNyKey={todayNyKey}
            initialSelectedDayKey={initialDriverDayKey}
            description={QUEUE_HELP}
            orders={ordersForConsole}
          />
        </div>
      </section>
    </main>
  );
}
