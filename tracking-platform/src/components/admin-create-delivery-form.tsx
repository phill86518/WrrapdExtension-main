"use client";

import { useMemo } from "react";

function minDatetimeLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function AdminCreateDeliveryForm({
  action,
  inModal,
}: {
  action: (formData: FormData) => void | Promise<void>;
  inModal?: boolean;
}) {
  const min = useMemo(() => minDatetimeLocal(), []);

  const field =
    "rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

  return (
    <form action={action} className={`grid gap-3 md:grid-cols-4 ${inModal ? "" : "mt-5"}`}>
      <input required name="customerName" placeholder="Customer name" className={field} />
      <input required name="customerPhone" placeholder="Customer phone" className={field} />
      <input required name="recipientName" placeholder="Recipient name" className={field} />
      <input required name="addressLine1" placeholder="Address line 1" className={`${field} md:col-span-2`} />
      <input required name="city" placeholder="City" className={field} />
      <input required name="state" placeholder="State" className={field} />
      <input required name="postalCode" placeholder="ZIP" className={field} />
      <input
        required
        type="datetime-local"
        name="scheduledFor"
        min={min}
        suppressHydrationWarning
        className={`${field} md:col-span-2`}
      />
      <p className="text-xs leading-relaxed text-slate-500 md:col-span-4">
        Past dates are disabled. Production logic is Amazon date + 1 day. Auto-allocation minimizes driver usage and only spills to a second driver when a day exceeds 10 stops.
      </p>
      <button
        className="rounded-xl bg-gradient-to-b from-indigo-600 to-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition hover:from-indigo-500 hover:to-indigo-600 md:col-span-4 md:max-w-xs"
        type="submit"
      >
        Create delivery
      </button>
    </form>
  );
}
