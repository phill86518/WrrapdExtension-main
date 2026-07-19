"use client";

import { DriverAvailabilityPanel } from "@/components/driver-availability-panel";
import type { DayShiftAvailability } from "@/lib/types";
import type { DriverPastOrderRow } from "@/components/driver-top-modals";
import { formatInTimeZone } from "date-fns-tz";

type Props = {
  weekStartMonday: string;
  days: string[];
  initialDays: Record<string, DayShiftAvailability>;
  deadlineLabel: string;
  pastOrders: DriverPastOrderRow[];
};

export function WrapstarAvailabilitySection({
  weekStartMonday,
  days,
  initialDays,
  deadlineLabel,
  pastOrders,
}: Props) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Availability</h2>
        <p className="mt-1 text-sm text-slate-600">
          Set morning (7–1) and afternoon (1–7) Eastern windows for the upcoming week.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <DriverAvailabilityPanel
          weekStartMonday={weekStartMonday}
          days={days}
          initialDays={initialDays}
          deadlineLabel={deadlineLabel}
        />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Recent wraps</h3>
        {pastOrders.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No past wraps yet.</p>
        ) : (
          <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
            {pastOrders.slice(0, 30).map((o) => (
              <li key={o.internalId} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <p className="font-medium text-slate-900">{o.publicOrderRef}</p>
                <p className="text-xs text-slate-600">
                  {o.recipientName} · {o.status}
                </p>
                <p className="text-xs text-slate-500">
                  {formatInTimeZone(new Date(o.updatedAtIso), "America/New_York", "MMM d, yyyy h:mm a zzz")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
