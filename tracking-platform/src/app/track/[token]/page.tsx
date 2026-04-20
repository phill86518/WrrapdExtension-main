import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { getOrderByTrackingToken } from "@/lib/data";
import { buildDemoSeedOrders, DEMO_CUSTOMER_TRACKING_TOKEN } from "@/lib/demo-orders";
import {
  TrackingLiveExperience,
  type TrackingPublicSnapshot,
} from "@/components/tracking-live-experience";

export const dynamic = "force-dynamic";

const NY = "America/New_York";

function toSnapshot(order: {
  status: string;
  etaMinutes?: number;
  driverName?: string;
  latestLocation?: { lat: number; lng: number; updatedAt: string };
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  proofPhotoUrl?: string;
}): TrackingPublicSnapshot {
  return {
    status: order.status,
    etaMinutes: order.etaMinutes ?? null,
    driverName: order.driverName ?? null,
    latestLocation: order.latestLocation ?? null,
    addressLine1: order.addressLine1,
    city: order.city,
    state: order.state,
    postalCode: order.postalCode,
    proofPhotoUrl: order.proofPhotoUrl ?? null,
  };
}

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let order = await getOrderByTrackingToken(token);
  if (!order && token === DEMO_CUSTOMER_TRACKING_TOKEN) {
    order = buildDemoSeedOrders().find((o) => o.trackingToken === token);
  }
  if (!order) notFound();

  const wrrapdDayLabel = formatInTimeZone(new Date(order.scheduledFor), NY, "EEEE, MMMM d, yyyy");
  const initial = toSnapshot(order);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <TrackingLiveExperience
        token={token}
        orderId={order.id}
        wrrapdDayLabel={wrrapdDayLabel}
        scheduledForIso={order.scheduledFor}
        createdAtIso={order.createdAt}
        initial={initial}
      />
    </main>
  );
}
