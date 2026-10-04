"use client";

import { useRef, useState } from "react";

type Fix = { lat: number; lng: number; accuracyM: number } | null;

function currentFix(): Promise<Fix> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  });
}

export function CourierDeliveryActions({
  orderId,
  status,
}: {
  orderId: string;
  status: string;
}) {
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [handedTo, setHandedTo] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const normalized = status === "en_route" ? "in_progress" : status;

  async function startDelivery() {
    if (!window.confirm("Start delivery?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "out_for_delivery" }),
      });
      if (!res.ok) throw new Error("failed");
      location.reload();
    } catch {
      alert("Could not update status. Please retry.");
      setBusy(false);
    }
  }

  async function submitDelivered() {
    if (!photo) {
      fileRef.current?.click();
      return;
    }
    setBusy(true);
    const fix = await currentFix();
    const form = new FormData();
    form.append("proofPhoto", photo);
    form.append("kind", "delivery");
    if (handedTo.trim()) form.append("handedTo", handedTo.trim());
    if (fix) {
      form.append("lat", String(fix.lat));
      form.append("lng", String(fix.lng));
      form.append("accuracyM", String(fix.accuracyM));
    }
    try {
      const res = await fetch(`/api/orders/${orderId}/proof`, { method: "POST", body: form });
      if (!res.ok) throw new Error("failed");
      location.reload();
    } catch {
      alert("Could not save the delivery photo. Check your signal and try again.");
      setBusy(false);
    }
  }

  if (normalized === "delivered") {
    return <p className="mt-2 text-xs font-semibold text-emerald-800">Delivered</p>;
  }

  return (
    <div className="mt-2 space-y-2">
      {normalized !== "out_for_delivery" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void startDelivery()}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Start delivery
        </button>
      ) : null}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-emerald-700 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 disabled:opacity-50"
          >
            {photo ? "Retake delivery photo" : "Take delivery photo"}
          </button>
          {photo ? <span className="text-xs text-emerald-900">Photo ready</span> : null}
        </div>
        <input
          type="text"
          value={handedTo}
          onChange={(e) => setHandedTo(e.target.value)}
          placeholder="Handed to (name) — required for gifts over $100"
          className="mt-2 w-full rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs"
        />
        <button
          type="button"
          disabled={busy || !photo}
          onClick={() => void submitDelivered()}
          className="mt-2 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Mark delivered"}
        </button>
      </div>
    </div>
  );
}
