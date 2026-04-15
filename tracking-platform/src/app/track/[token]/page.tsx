import Image from "next/image";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { getOrderByTrackingToken } from "@/lib/data";
import { buildDemoSeedOrders, DEMO_CUSTOMER_TRACKING_TOKEN } from "@/lib/demo-orders";

export const dynamic = "force-dynamic";

const NY = "America/New_York";

function statusLabel(status: string) {
  if (status === "scheduled") return "Scheduled";
  if (status === "assigned") return "Assigned";
  if (status === "en_route") return "En route";
  if (status === "delivered") return "Delivered";
  return "Cancelled";
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

  const mapUrl = order.latestLocation
    ? `https://www.google.com/maps?q=${order.latestLocation.lat},${order.latestLocation.lng}&z=14&output=embed`
    : `https://www.google.com/maps?q=${encodeURIComponent(
        `${order.addressLine1}, ${order.city}, ${order.state} ${order.postalCode}`,
      )}&z=14&output=embed`;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-semibold">Your Delivery Tracker</h1>
        <p className="mt-2 text-slate-300">Order {order.id}</p>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <h2 className="text-lg font-medium">Live Status</h2>
            <p className="mt-3">
              <span className="font-semibold">Current status:</span> {statusLabel(order.status)}
            </p>
            <p className="mt-2">
              <span className="font-semibold">ETA:</span>{" "}
              {order.etaMinutes ? `${order.etaMinutes} minutes` : "Calculating..."}
            </p>
            <p className="mt-2">
              <span className="font-semibold">Destination:</span> {order.addressLine1}, {order.city}, {order.state}{" "}
              {order.postalCode}
            </p>
            <p className="mt-3 rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 text-sm text-slate-200">
              <span className="font-semibold text-white">Your Wrrapd delivery window:</span>{" "}
              <time dateTime={order.scheduledFor}>{wrrapdDayLabel}</time>, between{" "}
              <strong>1:00 PM</strong> and <strong>7:00 PM ET</strong>. We may arrive anytime in that window.
            </p>
            {order.latestLocation && (
              <p className="mt-2 text-sm text-slate-300">
                Last GPS update: {new Date(order.latestLocation.updatedAt).toLocaleString()}
              </p>
            )}
          </section>
          <section className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <h2 className="text-lg font-medium">Live Map</h2>
            <iframe title="Live map" src={mapUrl} className="mt-3 h-72 w-full rounded border border-slate-700" />
          </section>
        </div>

        <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-4">
          <h2 className="text-lg font-medium">Delivery Timeline</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-200">
            <li>Scheduled at {new Date(order.createdAt).toLocaleString()}</li>
            <li>Assigned to driver {order.driverName || "(pending assignment)"}</li>
            <li>En route updates streamed from driver GPS</li>
            <li>Delivered with proof photo upload</li>
          </ol>
        </section>

        {order.proofPhotoUrl && (
          <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-4">
            <h2 className="text-lg font-medium">Proof of Delivery</h2>
            <Image
              src={order.proofPhotoUrl}
              alt="Proof of delivery"
              width={960}
              height={640}
              unoptimized
              className="mt-3 max-h-[420px] rounded object-contain"
            />
          </section>
        )}
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(function(){ window.location.reload(); }, 15000);`,
        }}
      />
    </main>
  );
}
