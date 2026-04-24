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
    "rounded-lg border-2 border-[#1a2744]/20 bg-white px-3 py-2.5 text-sm text-[#0f172a] shadow-sm placeholder:text-[#64748b] focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/40";

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
      <p className="text-xs font-medium leading-relaxed text-[#2d4a38] md:col-span-4">
        Past dates are disabled. Production logic is Amazon date + 1 day. Auto-allocation minimizes driver usage and only spills to a second driver when a day exceeds 10 stops.
      </p>
      <button
        className="rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-6 py-2.5 text-sm font-bold text-[#1a1a1a] shadow-lg shadow-amber-900/25 ring-1 ring-white/40 transition hover:from-amber-300 hover:to-amber-500 active:scale-[0.98] md:col-span-4 md:max-w-xs"
        type="submit"
      >
        Create delivery
      </button>
    </form>
  );
}
