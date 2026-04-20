"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

export type TrackingPublicSnapshot = {
  status: string;
  etaMinutes: number | null;
  driverName: string | null;
  latestLocation: { lat: number; lng: number; updatedAt: string } | null;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  proofPhotoUrl: string | null;
};

function statusLabel(status: string) {
  if (status === "scheduled") return "Scheduled";
  if (status === "assigned") return "Assigned";
  if (status === "en_route") return "En route";
  if (status === "delivered") return "Delivered";
  return "Cancelled";
}

function buildMapUrl(s: TrackingPublicSnapshot): string {
  if (s.latestLocation) {
    return `https://www.google.com/maps?q=${s.latestLocation.lat},${s.latestLocation.lng}&z=14&output=embed`;
  }
  return `https://www.google.com/maps?q=${encodeURIComponent(
    `${s.addressLine1}, ${s.city}, ${s.state} ${s.postalCode}`,
  )}&z=14&output=embed`;
}

function TrackingMapFrame({ mapUrl }: { mapUrl: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative mt-3 h-72 w-full overflow-hidden rounded border border-slate-700 bg-slate-950">
      {!loaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-950 text-sm text-slate-400">
          <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-slate-300" />
          <span>Loading map…</span>
        </div>
      )}
      <iframe
        title="Live map"
        src={mapUrl}
        className={`h-full w-full transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

export function TrackingLiveExperience({
  token,
  orderId,
  wrrapdDayLabel,
  scheduledForIso,
  createdAtIso,
  initial,
}: {
  token: string;
  orderId: string;
  wrrapdDayLabel: string;
  scheduledForIso: string;
  createdAtIso: string;
  initial: TrackingPublicSnapshot;
}) {
  const [snap, setSnap] = useState<TrackingPublicSnapshot>(initial);
  const mapUrl = useMemo(() => buildMapUrl(snap), [snap]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/track/${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const next = (await res.json()) as TrackingPublicSnapshot;
      setSnap(next);
    } catch {
      /* ignore transient network errors */
    }
  }, [token]);

  useEffect(() => {
    const id = window.setInterval(refresh, 20000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-semibold">Your Delivery Tracker</h1>
      <p className="mt-2 text-slate-300">Order {orderId}</p>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <h2 className="text-lg font-medium">Live Status</h2>
          <p className="mt-3">
            <span className="font-semibold">Current status:</span> {statusLabel(snap.status)}
          </p>
          <p className="mt-2">
            <span className="font-semibold">ETA:</span>{" "}
            {snap.etaMinutes != null ? `${snap.etaMinutes} minutes` : "Calculating..."}
          </p>
          <p className="mt-2">
            <span className="font-semibold">Destination:</span> {snap.addressLine1}, {snap.city}, {snap.state}{" "}
            {snap.postalCode}
          </p>
          <p className="mt-3 rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 text-sm text-slate-200">
            <span className="font-semibold text-white">Your Wrrapd delivery window:</span>{" "}
            <time dateTime={scheduledForIso}>{wrrapdDayLabel}</time>, between{" "}
            <strong>1:00 PM</strong> and <strong>7:00 PM ET</strong>. We may arrive anytime in that window.
          </p>
          {snap.latestLocation && (
            <p className="mt-2 text-sm text-slate-300">
              Last GPS update: {new Date(snap.latestLocation.updatedAt).toLocaleString()}
            </p>
          )}
          <p className="mt-3 text-xs text-slate-500">Updates about every 20 seconds. Refresh the page anytime.</p>
        </section>
        <section className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <h2 className="text-lg font-medium">Live Map</h2>
          <TrackingMapFrame key={mapUrl} mapUrl={mapUrl} />
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-4">
        <h2 className="text-lg font-medium">Delivery Timeline</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-200">
          <li>Scheduled at {new Date(createdAtIso).toLocaleString()}</li>
          <li>Assigned to driver {snap.driverName || "(pending assignment)"}</li>
          <li>En route updates streamed from driver GPS</li>
          <li>Delivered with proof photo upload</li>
        </ol>
      </section>

      {snap.proofPhotoUrl && (
        <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-4">
          <h2 className="text-lg font-medium">Proof of Delivery</h2>
          <Image
            src={snap.proofPhotoUrl}
            alt="Proof of delivery"
            width={960}
            height={640}
            unoptimized
            className="mt-3 max-h-[420px] rounded object-contain"
          />
        </section>
      )}
    </div>
  );
}
