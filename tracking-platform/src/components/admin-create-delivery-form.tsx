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

  return (
    <form action={action} className="mt-3 grid gap-2 md:grid-cols-4">
      <input required name="customerName" placeholder="Customer name" className="rounded border px-2 py-1" />
      <input required name="customerPhone" placeholder="Customer phone" className="rounded border px-2 py-1" />
      <input required name="recipientName" placeholder="Recipient name" className="rounded border px-2 py-1" />
      <input required name="addressLine1" placeholder="Address line 1" className="rounded border px-2 py-1 md:col-span-2" />
      <input required name="city" placeholder="City" className="rounded border px-2 py-1" />
      <input required name="state" placeholder="State" className="rounded border px-2 py-1" />
      <input required name="postalCode" placeholder="ZIP" className="rounded border px-2 py-1" />
      <input
        required
        type="datetime-local"
        name="scheduledFor"
        min={min}
        suppressHydrationWarning
        className="rounded border px-2 py-1 md:col-span-2"
      />
      <p className="text-xs text-slate-600 md:col-span-4">
        Past dates are disabled. Production logic is Amazon date + 1 day. Auto-allocation minimizes driver usage and only spills to a second driver when a day exceeds 10 stops.
      </p>
      <button className="rounded bg-black px-3 py-1 text-white md:col-span-1" type="submit">
        Create
      </button>
    </form>
  );
}
