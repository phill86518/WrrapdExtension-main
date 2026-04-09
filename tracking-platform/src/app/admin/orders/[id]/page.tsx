import Image from "next/image";
import { notFound } from "next/navigation";
import { getOrderById } from "@/lib/data";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    notFound();
  }
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <a href="/admin" className="text-sm text-blue-700 underline">
        Back to dashboard
      </a>
      <h1 className="mt-3 text-3xl font-semibold">Order {order.id}</h1>
      <div className="mt-5 space-y-3 rounded-lg border p-4">
        <p>
          <span className="font-medium">Recipient:</span> {order.recipientName}
        </p>
        <p>
          <span className="font-medium">Status:</span> {order.status}
        </p>
        {order.stopSequence != null && (
          <p>
            <span className="font-medium">Route stop:</span> {order.stopSequence} (optimized order for driver + day)
          </p>
        )}
        <p>
          <span className="font-medium">Driver:</span> {order.driverName || "Unassigned"}
        </p>
        <p>
          <span className="font-medium">Address:</span> {order.addressLine1}, {order.city}, {order.state}{" "}
          {order.postalCode}
        </p>
        <p>
          <span className="font-medium">ETA:</span> {order.etaMinutes ? `${order.etaMinutes} min` : "N/A"}
        </p>
        <p>
          <span className="font-medium">Tracking URL:</span>{" "}
          <a className="text-blue-700 underline" href={`/track/${order.trackingToken}`}>
            /track/{order.trackingToken}
          </a>
        </p>
        {order.latestLocation && (
          <p>
            <span className="font-medium">Latest GPS:</span> {order.latestLocation.lat}, {order.latestLocation.lng}
          </p>
        )}
        {order.proofPhotoUrl && (
          <div>
            <p className="font-medium">Proof of Delivery</p>
            <Image
              src={order.proofPhotoUrl}
              alt="Proof of delivery"
              width={720}
              height={360}
              className="mt-2 h-64 rounded object-cover"
            />
          </div>
        )}
      </div>
    </main>
  );
}
