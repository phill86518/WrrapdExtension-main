import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getOrderById, listWrapstars, listCourierDrivers, assignWrapstar, assignCourierDriver, updateOrderStatus } from "@/lib/data";
import { getSession } from "@/lib/auth";
import {
  normalizeOrderStatus,
  orderWrapstarId,
  orderWrapstarName,
  resolveFulfillmentMode,
  type OrderStatus,
} from "@/lib/types";
import { findWrapstarById } from "@/lib/wrapstar-registry";
import { findDeliveryDriverById } from "@/lib/driver-registry";
import {
  countWrapOnlyInMetro,
  isDriverNetworkUnlocked,
  metroForPostalCode,
} from "@/lib/metros";
import { formatUsdCents } from "@/lib/finance";

export const dynamic = "force-dynamic";

const STATUSES: OrderStatus[] = [
  "pending",
  "scheduled",
  "assigned",
  "accepted",
  "in_progress",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "refunded",
];

async function updateStatusAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const id = String(formData.get("orderId") || "");
  const status = String(formData.get("status") || "") as OrderStatus;
  await updateOrderStatus(id, status, "admin");
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
}

async function reassignAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const id = String(formData.get("orderId") || "");
  const wrapstarId = String(formData.get("wrapstarId") || "");
  await assignWrapstar(id, wrapstarId, "admin");
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/wrapstars");
  redirect(`/admin/orders/${id}`);
}

async function assignCourierAction(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const id = String(formData.get("orderId") || "");
  const courierDriverId = String(formData.get("courierDriverId") || "");
  await assignCourierDriver(id, courierDriverId, "admin");
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/drivers");
  redirect(`/admin/orders/${id}`);
}

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
  const [wrapstars, drivers] = await Promise.all([listWrapstars(), listCourierDrivers()]);
  const wsId = orderWrapstarId(order);
  const ws = wsId ? await findWrapstarById(wsId) : undefined;
  const status = normalizeOrderStatus(order.status);
  const mode = resolveFulfillmentMode(order, ws);
  const metro = metroForPostalCode(order.postalCode);
  const wrapOnlyCount = metro ? countWrapOnlyInMetro(metro.id, wrapstars) : 0;
  const unlocked = metro ? isDriverNetworkUnlocked(metro.id, wrapOnlyCount) : false;
  const courier =
    order.courierDriverId ? await findDeliveryDriverById(order.courierDriverId) : undefined;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/orders" className="text-sm text-blue-700 underline">
        Back to orders calendar
      </Link>
      <h1 className="mt-3 text-3xl font-semibold text-slate-900">Order detail</h1>
      <p className="mt-1 font-mono text-sm text-slate-600">{order.id}</p>
      {order.externalOrderId ? (
        <p className="text-sm text-slate-600">External: {order.externalOrderId}</p>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">Customer & giftee</h2>
          <p>
            <span className="font-medium">Customer:</span> {order.customerName} · {order.customerPhone}
          </p>
          {order.customerEmail ? (
            <p>
              <span className="font-medium">Email:</span> {order.customerEmail}
            </p>
          ) : null}
          <p>
            <span className="font-medium">Giftee:</span> {order.recipientName}
          </p>
          <p>
            <span className="font-medium">Address:</span> {order.addressLine1}
            {order.addressLine2 ? `, ${order.addressLine2}` : ""}, {order.city}, {order.state}{" "}
            {order.postalCode}
          </p>
          <p>
            <span className="font-medium">Retailer:</span> {order.retailer || "—"}
          </p>
          {order.orderValueCents != null ? (
            <p>
              <span className="font-medium">Order value:</span> {formatUsdCents(order.orderValueCents)}
            </p>
          ) : null}
        </section>

        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">Fulfillment</h2>
          <p>
            <span className="font-medium">Mode:</span>{" "}
            <span
              className={
                mode === "self_delivery"
                  ? "rounded-full bg-emerald-100 px-2 py-0.5 text-sm text-emerald-900"
                  : "rounded-full bg-indigo-100 px-2 py-0.5 text-sm text-indigo-900"
              }
            >
              {mode === "self_delivery" ? "Self-delivery" : "Driver final-mile"}
            </span>
          </p>
          {metro ? (
            <p className="text-xs text-slate-500">
              Metro {metro.name} · wrap-only {wrapOnlyCount}/{metro.driverUnlockMinWrapOnlyCount} ·{" "}
              {unlocked ? "driver network unlocked" : "driver network locked"}
            </p>
          ) : (
            <p className="text-xs text-slate-500">ZIP outside mapped launch metros</p>
          )}
          <p>
            <span className="font-medium">Status:</span>{" "}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-sm">{status}</span>
          </p>
          <p>
            <span className="font-medium">Scheduled:</span> {order.scheduledFor}
          </p>
          <p>
            <span className="font-medium">WrapStar:</span>{" "}
            {wsId ? (
              <Link href={`/admin/wrapstars/${wsId}`} className="text-blue-700 underline">
                {orderWrapstarName(order) || ws?.name || wsId}
              </Link>
            ) : (
              "Unassigned"
            )}
            {ws ? (
              <span className="ml-2 text-xs text-slate-500">
                ({ws.wrapOnly || ws.canDeliver === false ? "wrap-only" : "hybrid"})
              </span>
            ) : null}
          </p>
          {wsId ? (
            <p className="font-mono text-xs text-slate-500">
              ID {wsId}
              {ws?.homePostalCode ? ` · home ZIP ${ws.homePostalCode}` : ""}
              {order.assignmentSource ? ` · ${order.assignmentSource}` : ""}
            </p>
          ) : null}
          <p>
            <span className="font-medium">Driver:</span>{" "}
            {order.courierDriverId ? (
              <Link
                href={`/admin/drivers/${order.courierDriverId}`}
                className="text-blue-700 underline"
              >
                {order.courierDriverName || courier?.name || order.courierDriverId}
              </Link>
            ) : mode === "self_delivery" ? (
              "—"
            ) : (
              "Unassigned"
            )}
          </p>
          {order.stopSequence != null ? (
            <p>
              <span className="font-medium">Route stop:</span> {order.stopSequence}
            </p>
          ) : null}
          <p>
            <span className="font-medium">Tracking:</span>{" "}
            <a className="text-blue-700 underline" href={`/track/${order.trackingToken}`}>
              /track/{order.trackingToken}
            </a>
          </p>
          {order.latestLocation ? (
            <p>
              <span className="font-medium">Latest GPS:</span> {order.latestLocation.lat},{" "}
              {order.latestLocation.lng}
            </p>
          ) : null}
          <p>
            <span className="font-medium">ETA:</span>{" "}
            {order.etaMinutes ? `${order.etaMinutes} min` : "N/A"}
          </p>
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Actions</h2>
        <div className="mt-3 flex flex-wrap gap-6">
          <form action={updateStatusAction} className="flex items-end gap-2">
            <input type="hidden" name="orderId" value={order.id} />
            <label className="text-sm">
              Status
              <select name="status" defaultValue={status} className="ml-2 rounded border px-2 py-1.5">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
              Update status
            </button>
          </form>
          <form action={reassignAction} className="flex items-end gap-2">
            <input type="hidden" name="orderId" value={order.id} />
            <label className="text-sm">
              Reassign WrapStar
              <select
                name="wrapstarId"
                defaultValue={wsId || ""}
                className="ml-2 rounded border px-2 py-1.5"
                required
              >
                <option value="" disabled>
                  Select…
                </option>
                {wrapstars.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} · {w.displayId || w.id} (
                    {w.wrapOnly || w.canDeliver === false ? "wrap-only" : "hybrid"}) · ZIP{" "}
                    {w.homePostalCode}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded bg-indigo-700 px-3 py-1.5 text-sm text-white">
              Save WrapStar
            </button>
          </form>
          <form action={assignCourierAction} className="flex items-end gap-2">
            <input type="hidden" name="orderId" value={order.id} />
            <label className="text-sm">
              Assign Driver (courier)
              <select
                name="courierDriverId"
                defaultValue={order.courierDriverId || ""}
                className="ml-2 rounded border px-2 py-1.5"
              >
                <option value="">— None / self-delivery —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {d.displayId || d.id} · {d.metroId} · {d.status}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded bg-indigo-700 px-3 py-1.5 text-sm text-white">
              Save Driver
            </button>
          </form>
        </div>
      </section>

      {order.lineItems && order.lineItems.length > 0 ? (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">Line items</h2>
          <ul className="mt-3 space-y-3">
            {order.lineItems.map((li, i) => (
              <li key={i} className="flex gap-3 border-b border-slate-100 pb-3 last:border-0">
                {li.imageUrl || li.wrappingDesignImageUrl ? (
                  <Image
                    src={li.wrappingDesignImageUrl || li.imageUrl || ""}
                    alt=""
                    width={64}
                    height={64}
                    className="h-16 w-16 rounded object-cover"
                  />
                ) : null}
                <div className="text-sm">
                  <p className="font-medium">{li.title || "Item"}</p>
                  {li.giftMessage ? <p className="text-slate-600">Message: {li.giftMessage}</p> : null}
                  {li.occasion ? <p className="text-slate-600">Occasion: {li.occasion}</p> : null}
                  {li.wrappingOption ? <p className="text-slate-600">Wrap: {li.wrappingOption}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">WrapStar wrap status</h2>
        <div className="mt-2 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
          <p>
            <span className="font-medium">Phase:</span> {order.wrapPhase || "not started"}
          </p>
          <p>
            <span className="font-medium">Fulfillment:</span>{" "}
            {order.fulfillmentMode === "self_delivery"
              ? "Hybrid self-delivery"
              : order.fulfillmentMode === "driver_final_mile"
                ? "Driver final-mile"
                : "—"}
          </p>
          <p>
            <span className="font-medium">Shift:</span> {order.wrapShiftId || "—"}
          </p>
          <p>
            <span className="font-medium">Ready for courier:</span>{" "}
            {order.readyForCourierAt
              ? new Date(order.readyForCourierAt).toLocaleString()
              : "—"}
          </p>
          <p>
            <span className="font-medium">Video started:</span>{" "}
            {order.wrapVideoStartedAt
              ? new Date(order.wrapVideoStartedAt).toLocaleString()
              : "—"}
          </p>
          <p>
            <span className="font-medium">Finished wrapping / barcode:</span>{" "}
            {order.wrapFinishedAt ? new Date(order.wrapFinishedAt).toLocaleString() : "—"}
          </p>
          <p>
            <span className="font-medium">Video ended:</span>{" "}
            {order.wrapVideoEndedAt ? new Date(order.wrapVideoEndedAt).toLocaleString() : "—"}
          </p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {order.driverLabelQrUrl || order.driverLabelToken ? (
            <div className="rounded-lg border border-slate-100 p-3">
              <p className="text-sm font-semibold text-slate-900">Driver label QR</p>
              {order.driverLabelQrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={order.driverLabelQrUrl}
                  alt="Driver label QR"
                  className="mx-auto mt-2 w-full max-w-[200px]"
                />
              ) : null}
              {order.driverLabelToken ? (
                <a
                  className="mt-2 block text-xs text-blue-700 underline"
                  href={`/api/driver/scan/${order.driverLabelToken}`}
                >
                  Preview scan payload (Admin)
                </a>
              ) : null}
            </div>
          ) : null}
          {order.wrapVideoUrl ? (
            <div className="rounded-lg border border-slate-100 p-3">
              <p className="text-sm font-semibold text-slate-900">Wrap video</p>
              <video
                src={order.wrapVideoUrl}
                controls
                className="mt-2 aspect-video w-full rounded bg-black"
              />
              <a
                className="mt-2 block text-xs text-blue-700 underline"
                href={order.wrapVideoUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open in new tab
              </a>
            </div>
          ) : null}
        </div>
      </section>

      {order.proofPhotoUrl ? (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">Proof of delivery</h2>
          <Image
            src={order.proofPhotoUrl}
            alt="Proof of delivery"
            width={720}
            height={360}
            className="mt-2 h-64 rounded object-cover"
          />
        </section>
      ) : null}
    </div>
  );
}
