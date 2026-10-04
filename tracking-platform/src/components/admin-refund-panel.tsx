"use client";

import { useRef, useState } from "react";

type Refund = { id: string; amountCents: number; kind: string; reason: string; by: string; at: string };

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function AdminRefundPanel({
  orderId,
  orderNumber,
  refunds,
}: {
  orderId: string;
  orderNumber: string;
  refunds: Refund[];
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef<string>("");

  async function submit() {
    setError("");
    const trimmed = amount.trim();
    const cents = trimmed ? Math.round(parseFloat(trimmed) * 100) : undefined;
    if (trimmed && (!Number.isFinite(cents) || (cents as number) <= 0)) {
      setError("Enter a dollar amount, or leave it empty for a full refund.");
      return;
    }
    if (!reason.trim()) {
      setError("Enter a reason.");
      return;
    }
    const label = cents ? usd(cents) : "the full remaining amount";
    if (!window.confirm(`Refund ${label} for ${orderNumber}? The shopper gets an email.`)) return;
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: cents, reason: reason.trim(), requestId: requestIdRef.current }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Refund failed");
      location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refund failed");
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-rose-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-900">Refund</h2>
      {refunds.length ? (
        <ul className="mt-2 space-y-1 text-xs text-slate-700">
          {refunds.map((r) => (
            <li key={r.id}>
              {usd(r.amountCents)} · {r.kind} ·{" "}
              {new Date(r.at).toLocaleString("en-US", { timeZone: "America/New_York" })} ET · {r.reason} ({r.by})
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-700">
          Amount (empty = full)
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="mt-1 block w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="min-w-[14rem] flex-1 text-xs text-slate-700">
          Reason
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Gift arrived damaged"
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="rounded-lg bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Refunding…" : "Issue refund"}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p> : null}
    </section>
  );
}
