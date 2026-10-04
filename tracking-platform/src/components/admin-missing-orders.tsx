"use client";

import { useState } from "react";
import type { PaidOrderRow } from "@/lib/pay-reconcile";

export function AdminMissingOrders({ rows, error }: { rows: PaidOrderRow[]; error?: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function resend(orderNumber: string) {
    setBusy(orderNumber);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/reconcile/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not bring the order in");
      location.reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  if (error) {
    return (
      <p className="rounded-xl border-2 border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
        Could not check the pay server for missing orders ({error}). Reload in a minute; if it persists, check the pay
        server.
      </p>
    );
  }
  if (!rows.length) return null;
  return (
    <section className="rounded-2xl border-2 border-rose-400 bg-rose-50 p-5 shadow-md">
      <h2 className="text-lg font-bold text-rose-900">Paid, but not in Command Center ({rows.length})</h2>
      <p className="mt-1 text-sm text-rose-900">
        The shopper was charged but the order did not arrive here. The pay server retries every 5 minutes; you can
        also bring it in now.
      </p>
      {msg ? <p className="mt-2 text-sm font-semibold text-rose-800">{msg}</p> : null}
      <ul className="mt-3 divide-y divide-rose-200">
        {rows.map((r) => (
          <li key={r.orderNumber} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span>
              <strong className="font-mono">{r.orderNumber}</strong> · {r.retailer || "retailer ?"} · {r.customerEmail} · $
              {(r.amountCents / 100).toFixed(2)} · paid {new Date(r.timestamp).toLocaleString("en-US", { timeZone: "America/New_York" })}
              {r.refundedCents ? ` · refunded $${(r.refundedCents / 100).toFixed(2)}` : ""}
            </span>
            {r.canResend ? (
              <button
                type="button"
                disabled={busy === r.orderNumber}
                onClick={() => resend(r.orderNumber)}
                className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white"
              >
                {busy === r.orderNumber ? "Bringing in…" : "Bring into Command Center"}
              </button>
            ) : (
              <span className="text-xs font-semibold text-rose-800">Older order: add it with Create delivery</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
