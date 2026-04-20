import { getSession } from "@/lib/auth";
import { listDriverOrders, listDriverPastOrders } from "@/lib/data";
import { DriverConsole } from "@/components/driver-console";
import { DriverInstallCard } from "@/components/driver-install-card";
import { DriverLoginForm } from "@/components/driver-login-form";
import { DriverAccountPanel } from "@/components/driver-account-panel";
import { LogoutButton } from "@/components/logout-button";
import { getDriverProfile } from "@/lib/driver-profiles";
import {
  availabilityDeadlineForWeekMonday,
  getWeekAvailability,
  upcomingWeekFromToday,
} from "@/lib/availability-store";
import { DriverTopModals } from "@/components/driver-top-modals";
import { WrrapdLogo } from "@/components/wrrapd-logo";
import { formatInTimeZone, toDate } from "date-fns-tz";
import { formatDateKeyNy } from "@/lib/ny-date";
import type { DayShiftAvailability } from "@/lib/types";

export const dynamic = "force-dynamic";

const NY = "America/New_York";

function labelForNyDateKey(dateKey: string): string {
  return formatInTimeZone(toDate(`${dateKey}T12:00:00`, { timeZone: NY }), NY, "EEE MMM d, yyyy");
}

function driverDeliveriesHeading(orders: { scheduledFor: string }[]): { title: string; subtitleExtra?: string } {
  if (!orders.length) {
    return { title: "Your assigned deliveries" };
  }
  const keys = [...new Set(orders.map((o) => formatDateKeyNy(o.scheduledFor)))].sort();
  if (keys.length === 1) {
    return {
      title: `Deliveries for ${labelForNyDateKey(keys[0])}`,
      subtitleExtra: "If you have stops on other days, they appear in separate groups below.",
    };
  }
  return {
    title: "Your assigned deliveries",
    subtitleExtra: `Eastern delivery days in this queue: ${keys.map(labelForNyDateKey).join(" · ")}.`,
  };
}

export default async function DriverPage() {
  const session = await getSession();
  if (!session || session.role !== "driver") {
    return (
      <main className="mx-auto min-h-screen max-w-xl px-4 py-10">
        <WrrapdLogo className="h-14 w-auto max-w-[220px]" />
        <h1 className="mt-3 text-3xl font-semibold">Driver Companion Login</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to access your delivery queue.</p>
        <DriverLoginForm />
      </main>
    );
  }

  const orders = await listDriverOrders(session.userId);
  const deliveriesHead = driverDeliveriesHeading(orders);
  const pastOrdersRaw = await listDriverPastOrders(session.userId);
  const profile = await getDriverProfile(session.userId);
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
    })
  ) as Record<string, DayShiftAvailability>;

  // Primary seeded driver: always fully available for the upcoming week so routing can assign deliveries.
  if (session.userId === "drv-1") {
    initialDays = Object.fromEntries(
      week.days.map((d) => [d, { morning: true, afternoon: true } as DayShiftAvailability])
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
        <h1 className="mt-3 text-3xl font-semibold">Driver Companion</h1>
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Your onboarding status is <strong>{profile.onboardingStatus}</strong>. You cannot receive deliveries until approved by admin.
        </p>
        <DriverTopModals
          weekStartMonday={week.weekStartMonday}
          days={week.days}
          initialDays={initialDays}
          deadlineLabel={deadlineLabel}
          pastOrders={pastOrdersForModal}
        />
        <div className="mt-4">
          <DriverAccountPanel />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <WrrapdLogo className="h-14 w-auto max-w-[220px]" />
          <h1 className="mt-2 text-3xl font-semibold">Driver Companion</h1>
          <p className="text-sm text-slate-600">Welcome, {session.name}</p>
        </div>
        <LogoutButton redirectPath="/driver" />
      </div>
      <DriverTopModals
        weekStartMonday={week.weekStartMonday}
        days={week.days}
        initialDays={initialDays}
        deadlineLabel={deadlineLabel}
        pastOrders={pastOrdersForModal}
      />
      <div className="mb-4">
        <DriverInstallCard />
      </div>
      <DriverAccountPanel />
      <section className="mb-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">{deliveriesHead.title}</h2>
        <p className="mt-1 text-sm text-slate-600">
          Each card shows the <strong>Wrrapd delivery day (U.S. Eastern)</strong> — Amazon +1 calendar day, 1–7 PM
          window. <strong>Stop numbers are per day</strong> (same driver + same Eastern date); orders on different days
          each start at Stop 1. Stops are ordered with a nearest-neighbor + 2-opt heuristic from the Northeast Jax hub
          (ZIP 32218 area).
          {deliveriesHead.subtitleExtra ? ` ${deliveriesHead.subtitleExtra}` : ""}
        </p>
        <div className="mt-4">
          <DriverConsole
            orders={orders.map((o) => {
              return {
                id: o.id,
                publicOrderRef: o.externalOrderId?.trim() || o.id,
                recipientName: o.recipientName,
                addressLine1: o.addressLine1,
                city: o.city,
                state: o.state,
                postalCode: o.postalCode,
                status: o.status,
                stopSequence: o.stopSequence,
                scheduledFor: o.scheduledFor,
              };
            })}
          />
        </div>
      </section>
    </main>
  );
}
