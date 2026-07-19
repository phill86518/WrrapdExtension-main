"use client";

import { useState } from "react";

export function CourierDeliveryActions({
  orderId,
  status,
}: {
  orderId: string;
  status: string;
}) {
  const [busy, setBusy] = useState(false);
  const normalized = status === "en_route" ? "in_progress" : status;

  async function setStatus(next: "en_route" | "delivered") {
    const label = next === "en_route" ? "Start delivery?" : "Mark delivered?";
    if (!window.confirm(label)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error("failed");
      location.reload();
    } catch {
      alert("Could not update status. Please retry.");
      setBusy(false);
    }
  }

  if (normalized === "delivered") {
    return <p className="mt-2 text-xs font-semibold text-emerald-800">Delivered</p>;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {normalized !== "in_progress" && normalized !== "out_for_delivery" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void setStatus("en_route")}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Start delivery
        </button>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void setStatus("delivered")}
        className="rounded-lg border border-emerald-700 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-950 disabled:opacity-50"
      >
        Mark delivered
      </button>
    </div>
  );
}
