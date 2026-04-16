"use client";

import { useState, type ReactNode } from "react";
import { DriverAvailabilityPanel } from "@/components/driver-availability-panel";
import type { DayShiftAvailability } from "@/lib/types";
import { formatInTimeZone } from "date-fns-tz";

export type DriverPastOrderRow = {
  internalId: string;
  publicOrderRef: string;
  recipientName: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  status: string;
  updatedAtIso: string;
};

type Props = {
  weekStartMonday: string;
  days: string[];
  initialDays: Record<string, DayShiftAvailability>;
  deadlineLabel: string;
  pastOrders: DriverPastOrderRow[];
};

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="driver-modal-title"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <h2 id="driver-modal-title" className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function DriverTopModals(props: Props) {
  const [open, setOpen] = useState<null | "availability" | "history">(null);

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-xl border-2 border-slate-800 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
          onClick={() => setOpen("availability")}
        >
          Weekly availability
        </button>
        <button
          type="button"
          className="rounded-xl border-2 border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm active:scale-[0.99]"
          onClick={() => setOpen("history")}
        >
          Delivery history
        </button>
      </div>

      {open === "availability" && (
        <ModalShell title="Weekly availability" onClose={() => setOpen(null)}>
          <DriverAvailabilityPanel
            weekStartMonday={props.weekStartMonday}
            days={props.days}
            initialDays={props.initialDays}
            deadlineLabel={props.deadlineLabel}
          />
        </ModalShell>
      )}

      {open === "history" && (
        <ModalShell title="Delivery history" onClose={() => setOpen(null)}>
          {props.pastOrders.length === 0 ? (
            <p className="text-sm text-slate-600">No completed or cancelled deliveries recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {props.pastOrders.map((row) => {
                const when = formatInTimeZone(
                  new Date(row.updatedAtIso),
                  "America/New_York",
                  "MMM d, yyyy · h:mm a",
                );
                return (
                  <li
                    key={`${row.internalId}-${row.updatedAtIso}`}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <p className="font-semibold text-slate-900">{row.publicOrderRef}</p>
                    {row.publicOrderRef !== row.internalId && (
                      <p className="text-xs text-slate-500">Wrrapd ID: {row.internalId}</p>
                    )}
                    <p className="mt-1 text-slate-800">{row.recipientName}</p>
                    <p className="text-slate-600">
                      {row.addressLine1}, {row.city}, {row.state} {row.postalCode}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                      {row.status} · {when} ET
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </ModalShell>
      )}
    </>
  );
}
