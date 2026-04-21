"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getISODay } from "date-fns";
import {
  calendarDayLabelNy,
  formatDateKeyNy,
  listDateKeysInNyMonth,
  nyMonthContainingDateKey,
  shiftNyMonthYm,
} from "@/lib/ny-date";
import { formatInTimeZone, toDate } from "date-fns-tz";

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

const NY = "America/New_York";

/** Bumped when driver queue UI changes — if you do not see this under the title, you are not on the latest deploy. */
export const DRIVER_QUEUE_UI_REV = "2026-04-25-driver-calendar";

function monthTitleYm(ym: string): string {
  const d = toDate(`${ym}-01T12:00:00`, { timeZone: NY });
  return formatInTimeZone(d, NY, "MMMM yyyy");
}

function buildSunFirstGrid(monthDayKeys: string[]): (string | null)[] {
  if (!monthDayKeys.length) return [];
  const firstKey = monthDayKeys[0]!;
  const first = toDate(`${firstKey}T12:00:00`, { timeZone: NY });
  const pad = getISODay(first) % 7;
  const cells: (string | null)[] = [...Array(pad).fill(null), ...monthDayKeys];
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 42) cells.push(null);
  return cells.slice(0, 42);
}

export function DriverConsole({
  orders,
  todayNyKey,
  initialSelectedDayKey,
  description,
}: {
  orders: DriverOrder[];
  /** Eastern calendar date for "today" (from server clock for stable SSR + hydration). */
  todayNyKey: string;
  /** First day shown: today if there are stops today, else earliest Eastern day with assigned stops. */
  initialSelectedDayKey: string;
  description: string;
}) {
  const [selectedDayKey, setSelectedDayKey] = useState(initialSelectedDayKey);
  const [monthYm, setMonthYm] = useState(nyMonthContainingDateKey(initialSelectedDayKey));

  const countsByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders) {
      const k = formatDateKeyNy(o.scheduledFor);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [orders]);

  const filteredOrders = useMemo(
    () => orders.filter((o) => formatDateKeyNy(o.scheduledFor) === selectedDayKey),
    [orders, selectedDayKey],
  );

  const maxStopByNyDay = useMemo(() => {
    const m = new Map<string, number>();
    const routed = new Set(["scheduled", "assigned", "en_route"]);
    for (const o of filteredOrders) {
      if (o.stopSequence == null || !o.scheduledFor || !routed.has(o.status)) continue;
      const day = formatDateKeyNy(o.scheduledFor);
      m.set(day, Math.max(m.get(day) ?? 0, o.stopSequence));
    }
    return m;
  }, [filteredOrders]);

  const monthDayKeys = useMemo(() => listDateKeysInNyMonth(monthYm), [monthYm]);
  const gridCells = useMemo(() => buildSunFirstGrid(monthDayKeys), [monthDayKeys]);
  const otherDayKeys = useMemo(
    () => [...countsByDay.keys()].filter((k) => k !== todayNyKey).sort(),
    [countsByDay, todayNyKey],
  );

  const allStopDayKeys = useMemo(
    () => [...countsByDay.keys()].filter((k) => k.length > 0).sort(),
    [countsByDay],
  );

  const headingTitle =
    selectedDayKey === todayNyKey
      ? "Today's deliveries (Eastern)"
      : `Deliveries for ${calendarDayLabelNy(selectedDayKey)}`;

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
      <div>
        <h2 className="text-xl font-semibold text-slate-900">{headingTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
        <p className="mt-1 text-sm font-medium text-slate-800">
          {filteredOrders.length} stop{filteredOrders.length === 1 ? "" : "s"} for{" "}
          <span className="text-emerald-800">{calendarDayLabelNy(selectedDayKey)}</span> (Eastern)
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Wrrapd web driver UI · rev {DRIVER_QUEUE_UI_REV} · list is filtered by Eastern calendar date of each stop.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Select day (Eastern)</p>
        <p className="mt-1 text-xs text-slate-600">
          Tap <strong>Today</strong>, a <strong>date chip</strong> below, or a <strong>day in the calendar</strong> to
          show only deliveries scheduled on that Eastern date.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedDayKey(todayNyKey);
              setMonthYm(nyMonthContainingDateKey(todayNyKey));
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              selectedDayKey === todayNyKey
                ? "bg-slate-900 text-white"
                : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
            }`}
          >
            Today
          </button>
          {otherDayKeys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setSelectedDayKey(k);
                setMonthYm(nyMonthContainingDateKey(k));
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                selectedDayKey === k
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
              }`}
            >
              {calendarDayLabelNy(k)}
              <span className="ml-1 text-xs opacity-80">({countsByDay.get(k) ?? 0})</span>
            </button>
          ))}
        </div>

        {allStopDayKeys.length > 0 ? (
          <div className="mt-3 rounded-md border border-slate-200 bg-white p-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">All scheduled days</p>
            <div className="mt-1.5 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
              {allStopDayKeys.map((k) => {
                const isSel = k === selectedDayKey;
                const isTodayChip = k === todayNyKey;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setSelectedDayKey(k);
                      setMonthYm(nyMonthContainingDateKey(k));
                    }}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      isSel
                        ? "bg-slate-900 text-white"
                        : isTodayChip
                          ? "border border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100"
                          : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                    }`}
                  >
                    {formatInTimeZone(toDate(`${k}T12:00:00`, { timeZone: NY }), NY, "EEE MMM d")}
                    <span className={isSel ? "text-slate-200" : "text-slate-500"}>
                      {" "}
                      ({countsByDay.get(k) ?? 0})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
            onClick={() => setMonthYm((m) => shiftNyMonthYm(m, -1))}
            aria-label="Previous month"
          >
            ←
          </button>
          <span className="text-sm font-semibold text-slate-900">{monthTitleYm(monthYm)}</span>
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
            onClick={() => setMonthYm((m) => shiftNyMonthYm(m, 1))}
            aria-label="Next month"
          >
            →
          </button>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {gridCells.map((cellKey, idx) => {
            if (!cellKey) {
              return <div key={`e-${idx}`} className="aspect-square rounded border border-transparent" />;
            }
            const count = countsByDay.get(cellKey) ?? 0;
            const isSelected = cellKey === selectedDayKey;
            const isTodayCell = cellKey === todayNyKey;
            return (
              <button
                key={cellKey}
                type="button"
                onClick={() => {
                  setSelectedDayKey(cellKey);
                  setMonthYm(nyMonthContainingDateKey(cellKey));
                }}
                className={`flex aspect-square flex-col items-center justify-center rounded border text-sm font-medium ${
                  isSelected
                    ? "border-slate-900 bg-slate-900 text-white"
                    : count > 0
                      ? "border-emerald-500 bg-emerald-50 text-emerald-950 hover:bg-emerald-100"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                } ${isTodayCell && !isSelected ? "ring-1 ring-amber-400" : ""}`}
              >
                <span>{Number(cellKey.slice(8, 10))}</span>
                {count > 0 ? (
                  <span className={`text-[10px] font-normal ${isSelected ? "text-slate-200" : "text-emerald-800"}`}>
                    {count} stop{count === 1 ? "" : "s"}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {offlineQueuedCount > 0 && (
        <div className="rounded border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
          {offlineQueuedCount} GPS update(s) queued offline. They will auto-sync when connectivity returns.
        </div>
      )}
      {filteredOrders.map((order) => (
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
      {orders.length > 0 && filteredOrders.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
          No assigned stops for {calendarDayLabelNy(selectedDayKey)}. Use the calendar or quick day buttons to
          switch to a day with deliveries.
        </p>
      )}
    </div>
  );
}
