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
import { formatInTimeZone } from "date-fns-tz";
import type { DayShiftAvailability } from "@/lib/types";

export const dynamic = "force-dynamic";

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
  const pastOrdersRaw = await listDriverPastOrders(session.userId);
  const profile = await getDriverProfile(session.userId);
  const week = upcomingWeekFromToday();
  const existing = await getWeekAvailability(session.userId, week.weekStartMonday);
  const initialDays = Object.fromEntries(
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
        <h2 className="text-xl font-semibold text-slate-900">Today&apos;s deliveries</h2>
        <p className="mt-1 text-sm text-slate-600">
          Stops assigned to you in the admin command center appear here (route order by stop number).
        </p>
        <div className="mt-4">
          <DriverConsole
            orders={orders.map((o) => ({
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
            }))}
          />
        </div>
      </section>
    </main>
  );
}
