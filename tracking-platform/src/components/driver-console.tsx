"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateKeyNy } from "@/lib/ny-date";
import { formatInTimeZone } from "date-fns-tz";

type DriverOrder = {
  /** Firestore document id — use for API calls */
  id: string;
  /** Same rule as admin: partner ref when set, else internal id */
  publicOrderRef: string;
  recipientName: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  status: string;
  stopSequence?: number;
  scheduledFor: string;
};

export function DriverConsole({ orders }: { orders: DriverOrder[] }) {
  const maxStopByNyDay = useMemo(() => {
    const m = new Map<string, number>();
    const routed = new Set(["scheduled", "assigned", "en_route"]);
    for (const o of orders) {
      if (o.stopSequence == null || !o.scheduledFor || !routed.has(o.status)) continue;
      const day = formatDateKeyNy(o.scheduledFor);
      m.set(day, Math.max(m.get(day) ?? 0, o.stopSequence));
    }
    return m;
  }, [orders]);

  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [offlineQueuedCount, setOfflineQueuedCount] = useState(0);
  const [proofFiles, setProofFiles] = useState<Record<string, File | null>>({});
  const [autoGpsEnabled, setAutoGpsEnabled] = useState<Record<string, boolean>>({});

  function getQueue() {
    const raw = localStorage.getItem("driver_sync_queue");
    if (!raw) return [];
    try {
      return JSON.parse(raw) as Array<{
        type: "location" | "proof";
        orderId: string;
        lat: number;
        lng: number;
        etaMinutes: number;
        dataUrl?: string;
      }>;
    } catch {
      return [];
    }
  }

  function setQueue(
    queue: Array<{
      type: "location" | "proof";
      orderId: string;
      lat: number;
      lng: number;
      etaMinutes: number;
      dataUrl?: string;
    }>,
  ) {
    localStorage.setItem("driver_sync_queue", JSON.stringify(queue));
    setOfflineQueuedCount(queue.length);
  }

  const flushQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    const queue = getQueue();
    if (!queue.length) return;

    const remaining: typeof queue = [];
    for (const item of queue) {
      try {
        const response =
          item.type === "location"
            ? await fetch(`/api/orders/${item.orderId}/location`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(item),
              })
            : await fetch(`/api/orders/${item.orderId}/proof`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  dataUrl: item.dataUrl,
                }),
              });
        if (!response.ok) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    setQueue(remaining);
  }, []);

  useEffect(() => {
    setOfflineQueuedCount(getQueue().length);
    void flushQueue();
    const onOnline = () => {
      void flushQueue();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flushQueue]);

  const postLocation = useCallback(async (orderId: string) => {
    if (!navigator.geolocation) return alert("Geolocation is not available on this device.");
    setBusyOrder(orderId);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const payload = {
          type: "location" as const,
          orderId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          etaMinutes: 20,
        };
        try {
          const response = await fetch(`/api/orders/${orderId}/location`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!response.ok) throw new Error("Location upload failed");
        } catch {
          const queue = getQueue();
          queue.push(payload);
          setQueue(queue);
          alert("Offline or weak signal detected. GPS update queued and will retry automatically.");
        }
        setBusyOrder(null);
        if (!autoGpsEnabled[orderId]) {
          location.reload();
        }
      },
      () => {
        setBusyOrder(null);
        alert("Could not read GPS. Please allow location permissions.");
      },
    );
  }, [autoGpsEnabled]);

  useEffect(() => {
    const activeOrderIds = orders.filter((o) => o.status === "en_route").map((o) => o.id);
    if (!activeOrderIds.length) return;
    const interval = setInterval(() => {
      activeOrderIds.forEach((orderId) => {
        if (autoGpsEnabled[orderId]) {
          void postLocation(orderId);
        }
      });
    }, 30000);
    return () => clearInterval(interval);
  }, [autoGpsEnabled, orders, postLocation]);

  async function uploadProof(orderId: string) {
    const file = proofFiles[orderId];
    if (!file) {
      alert("Please pick a photo first.");
      return;
    }
    const confirmed = window.confirm("Are you sure you want to complete this delivery?");
    if (!confirmed) return;
    setBusyOrder(orderId);
    const formData = new FormData();
    formData.append("proofPhoto", file);
    try {
      const response = await fetch(`/api/orders/${orderId}/proof`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        const queue = getQueue();
        queue.push({
          type: "proof",
          orderId,
          lat: 0,
          lng: 0,
          etaMinutes: 0,
          dataUrl: String(reader.result || ""),
        });
        setQueue(queue);
      };
      reader.readAsDataURL(file);
      alert("Offline or weak signal detected. Proof photo queued and will retry automatically.");
    } finally {
      setBusyOrder(null);
      location.reload();
    }
  }

  async function startDelivery(orderId: string) {
    const confirmed = window.confirm("Start delivery now? (You can change this later from the admin dashboard.)");
    if (!confirmed) return;
    setBusyOrder(orderId);
    try {
      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "en_route" }),
      });
      if (!response.ok) throw new Error("Unable to start delivery");
    } catch {
      alert("Could not start delivery right now. Please retry.");
    } finally {
      setBusyOrder(null);
      location.reload();
    }
  }

  return (
    <div className="space-y-4">
      {offlineQueuedCount > 0 && (
        <div className="rounded border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
          {offlineQueuedCount} GPS update(s) queued offline. They will auto-sync when connectivity returns.
        </div>
      )}
      {orders.map((order) => (
        <div key={order.id} className="rounded-lg border p-4 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="font-semibold text-lg leading-tight">{order.publicOrderRef}</p>
              {order.publicOrderRef !== order.id && (
                <p className="text-xs text-slate-500">Wrrapd ID: {order.id}</p>
              )}
            </div>
            {order.stopSequence != null && (
              <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                Stop {order.stopSequence}
                {(() => {
                  const dayKey = formatDateKeyNy(order.scheduledFor);
                  const dayShort = formatInTimeZone(new Date(order.scheduledFor), "America/New_York", "MMM d");
                  const total = maxStopByNyDay.get(dayKey);
                  const ofPart = total != null && total > 1 ? ` of ${total}` : "";
                  return ` · ${dayShort}${ofPart}`;
                })()}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-slate-800">
            Wrrapd day (ET):{" "}
            {formatInTimeZone(new Date(order.scheduledFor), "America/New_York", "EEEE, MMM d, yyyy")}
            <span className="font-normal text-slate-600"> · 1:00–7:00 PM route window</span>
          </p>
          <p className="text-sm">
            {order.recipientName} - {order.addressLine1}, {order.city}, {order.state} {order.postalCode}
          </p>
          <p className="mt-2 text-xs uppercase tracking-wide text-slate-600">{order.status}</p>

          <div className="mt-3 grid gap-2">
            <button
              className="w-full rounded bg-black px-4 py-3 text-lg font-semibold text-white"
              type="button"
              onClick={() => startDelivery(order.id)}
              disabled={busyOrder === order.id}
            >
              {busyOrder === order.id ? "Starting..." : "Start Delivery"}
            </button>

            <button
              className="w-full rounded border px-4 py-3 text-lg font-semibold"
              type="button"
              onClick={() => postLocation(order.id)}
              disabled={busyOrder === order.id}
            >
              {busyOrder === order.id ? "Broadcasting..." : "Broadcast GPS"}
            </button>

            <button
              type="button"
              className={`w-full rounded px-4 py-3 text-lg font-semibold ${
                autoGpsEnabled[order.id] ? "bg-emerald-700 text-white" : "border"
              }`}
              onClick={() =>
                setAutoGpsEnabled((prev) => ({
                  ...prev,
                  [order.id]: !prev[order.id],
                }))
              }
            >
              {autoGpsEnabled[order.id] ? "Auto GPS: ON (30s)" : "Auto GPS: OFF"}
            </button>

            <input
              type="file"
              name="proofPhoto"
              accept="image/*"
              required
              className="w-full rounded border p-2 text-sm"
              onChange={(e) =>
                setProofFiles((prev) => ({
                  ...prev,
                  [order.id]: e.target.files?.[0] ?? null,
                }))
              }
            />
            <button
              className="w-full rounded bg-emerald-700 px-4 py-3 text-lg font-semibold text-white"
              type="button"
              onClick={() => uploadProof(order.id)}
              disabled={busyOrder === order.id}
            >
              {busyOrder === order.id ? "Uploading..." : "Complete Delivery + Upload Proof"}
            </button>
          </div>
        </div>
      ))}
      {orders.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
          No stops assigned to you yet. When admin assigns orders to your name, they will list here with Start
          delivery, GPS, and proof photo.
        </p>
      )}
    </div>
  );
}
