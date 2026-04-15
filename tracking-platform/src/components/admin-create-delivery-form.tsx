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
}: {
  action: (formData: FormData) => void | Promise<void>;
}) {
  const min = useMemo(() => minDatetimeLocal(), []);

  const field =
    "rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10";

  return (
    <form action={action} className="mt-5 grid gap-3 md:grid-cols-4">
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
      <p className="text-xs leading-relaxed text-zinc-500 md:col-span-4">
        Past dates are disabled. Production logic is Amazon date + 1 day. Auto-allocation minimizes driver usage and only spills to a second driver when a day exceeds 10 stops.
      </p>
      <button
        className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 md:col-span-4 md:max-w-xs"
        type="submit"
      >
        Create delivery
      </button>
    </form>
  );
}
