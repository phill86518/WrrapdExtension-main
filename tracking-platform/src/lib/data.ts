import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { Order, DeliveryStatus, OrdersFilePayload } from "@/lib/types";
import { getFirestoreDb } from "@/lib/firebase-admin";
import { buildDemoSeedOrders } from "@/lib/demo-orders";
import { computeAssignmentsForOrders } from "@/lib/allocation";
import { parseScheduledForInput, validateScheduledInstant } from "@/lib/scheduling";
import { getDriverProfile } from "@/lib/driver-profiles";
import { assignStopSequences } from "@/lib/route-optimization";
import { findDriverById, listRegisteredDrivers } from "@/lib/driver-registry";
import { uploadProofDataUrl } from "@/lib/proof-storage";

const nowIso = () => new Date().toISOString();

const ORDERS_FILE_VERSION = 4;

const db = getFirestoreDb();
const ordersCollection = db?.collection("orders");
const dataDir = path.join(process.cwd(), ".data");
const fallbackOrdersPath = path.join(dataDir, "orders.json");

function isVersionedPayload(data: unknown): data is OrdersFilePayload {
  return (
    typeof data === "object" &&
    data !== null &&
    "version" in data &&
    "orders" in data &&
    typeof (data as OrdersFilePayload).version === "number" &&
    Array.isArray((data as OrdersFilePayload).orders)
  );
}

async function writeFallbackPayload(orders: Order[]) {
  await mkdir(dataDir, { recursive: true });
  const payload: OrdersFilePayload = { version: ORDERS_FILE_VERSION, orders };
  await writeFile(fallbackOrdersPath, JSON.stringify(payload, null, 2), "utf8");
}

async function migrateOrLoadFallbackOrders(): Promise<Order[]> {
  if (!existsSync(fallbackOrdersPath)) {
    const seed = buildDemoSeedOrders();
    const allocated = await applyAutoAllocationToOrders(seed);
    await writeFallbackPayload(allocated);
    return allocated;
  }
  const raw = JSON.parse(await readFile(fallbackOrdersPath, "utf8"));
  if (isVersionedPayload(raw) && raw.version >= ORDERS_FILE_VERSION) {
    return raw.orders;
  }
  if (isVersionedPayload(raw) && raw.version === 3) {
    const sequenced = assignStopSequences(raw.orders);
    await writeFallbackPayload(sequenced);
    return sequenced;
  }
  const seed = buildDemoSeedOrders();
  const allocated = await applyAutoAllocationToOrders(seed);
  await writeFallbackPayload(allocated);
  return allocated;
}

async function readFallbackOrders(): Promise<Order[]> {
  return migrateOrLoadFallbackOrders();
}

export async function applyAutoAllocationToOrders(orders: Order[]): Promise<Order[]> {
  const drivers = await listRegisteredDrivers();
  const map = await computeAssignmentsForOrders({ orders, drivers });
  const merged = orders.map((o) => {
    if (o.status === "delivered" || o.status === "cancelled" || o.status === "en_route") {
      return o;
    }
    const a = map.get(o.id);
    if (!a) return o;
    const next: Order = {
      ...o,
      driverId: a.driverId,
      driverName: a.driverName,
      updatedAt: nowIso(),
      updatedBy: "allocator",
    };
    if (next.status === "scheduled") next.status = "assigned";
    return next;
  });
  return assignStopSequences(merged);
}

export async function runAutoAllocation(): Promise<void> {
  if (ordersCollection) {
    const snap = await ordersCollection.get();
    const orders = snap.docs.map((d) => d.data() as Order);
    const next = await applyAutoAllocationToOrders(orders);
    await Promise.all(next.map((o) => ordersCollection.doc(o.id).set(o)));
    return;
  }
  const orders = await readFallbackOrders();
  const next = await applyAutoAllocationToOrders(orders);
  await writeFallbackPayload(next);
}

export async function listDrivers() {
  return listRegisteredDrivers();
}

export async function unassignDeletedDriverOrders(driverId: string): Promise<void> {
  if (ordersCollection) {
    const snap = await ordersCollection.get();
    const orders = snap.docs.map((d) => d.data() as Order);
    const updated = orders.map((o) =>
      o.driverId === driverId
        ? {
            ...o,
            driverId: undefined,
            driverName: undefined,
            stopSequence: undefined,
            status: o.status === "assigned" || o.status === "en_route" ? "scheduled" : o.status,
            updatedAt: nowIso(),
            updatedBy: "admin-driver-delete",
          }
        : o,
    );
    const allocated = await applyAutoAllocationToOrders(updated);
    await Promise.all(allocated.map((o) => ordersCollection.doc(o.id).set(o)));
    return;
  }

  const orders = await readFallbackOrders();
  const updated = orders.map((o) =>
    o.driverId === driverId
      ? {
          ...o,
          driverId: undefined,
          driverName: undefined,
          stopSequence: undefined,
          status: o.status === "assigned" || o.status === "en_route" ? "scheduled" : o.status,
          updatedAt: nowIso(),
          updatedBy: "admin-driver-delete",
        }
      : o,
  );
  const allocated = await applyAutoAllocationToOrders(updated);
  await writeFallbackPayload(allocated);
}

export type CreateOrderInput = {
  customerName: string;
  customerPhone: string;
  recipientName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  scheduledFor: string;
  sourceNote?: string;
  externalOrderId?: string;
};

export async function createOrder(
  input: CreateOrderInput,
): Promise<{ ok: true; order: Order } | { ok: false; error: string }> {
  const scheduledAt = parseScheduledForInput(input.scheduledFor);
  const check = validateScheduledInstant(scheduledAt);
  if (!check.ok) {
    return { ok: false, error: check.message };
  }
  const scheduledIso = scheduledAt.toISOString();
  const id = `ord-${Math.floor(Math.random() * 9000 + 1000)}`;
  const order: Order = {
    id,
    trackingToken: randomUUID(),
    status: "scheduled",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    sourceNote:
      input.sourceNote ??
      "Test phase: manual / planner (production: Amazon delivery day + 1)",
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    recipientName: input.recipientName,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    scheduledFor: scheduledIso,
    externalOrderId: input.externalOrderId,
  };
  if (ordersCollection) {
    await ordersCollection.doc(order.id).set(order);
    await runAutoAllocation();
  } else {
    const orders = await readFallbackOrders();
    orders.push(order);
    const next = await applyAutoAllocationToOrders(orders);
    await writeFallbackPayload(next);
  }
  const saved = await getOrderById(order.id);
  return { ok: true, order: saved ?? order };
}

export async function listOrdersByStatus(status: "active" | "scheduled" | "past") {
  const orders = ordersCollection
    ? ((await ordersCollection.get()).docs.map((doc) => doc.data() as Order) as Order[])
    : await readFallbackOrders();
  if (status === "active") {
    return orders.filter((o) => o.status === "assigned" || o.status === "en_route");
  }
  if (status === "scheduled") {
    return orders.filter((o) => o.status === "scheduled");
  }
  return orders.filter((o) => o.status === "delivered" || o.status === "cancelled");
}

export async function listAllOrders(): Promise<Order[]> {
  if (ordersCollection) {
    const snap = await ordersCollection.get();
    return snap.docs.map((d) => d.data() as Order);
  }
  return readFallbackOrders();
}

export async function listDriverOrders(driverId: string) {
  const profile = await getDriverProfile(driverId);
  if (profile.onboardingStatus !== "approved") {
    return [];
  }
  const orders = ordersCollection
    ? ((await ordersCollection.get()).docs.map((doc) => doc.data() as Order) as Order[])
    : await readFallbackOrders();
  const mine = orders.filter(
    (o) =>
      o.driverId === driverId &&
      (o.status === "assigned" || o.status === "en_route" || o.status === "scheduled"),
  );
  return mine.sort((a, b) => {
    const sa = a.stopSequence ?? 9999;
    const sb = b.stopSequence ?? 9999;
    if (sa !== sb) return sa - sb;
    return new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime() || a.id.localeCompare(b.id);
  });
}

export async function getOrderById(id: string) {
  if (ordersCollection) {
    const snap = await ordersCollection.doc(id).get();
    return snap.exists ? (snap.data() as Order) : undefined;
  }
  const orders = await readFallbackOrders();
  return orders.find((o) => o.id === id);
}

export async function getOrderByTrackingToken(token: string) {
  const orders = ordersCollection
    ? ((await ordersCollection.get()).docs.map((doc) => doc.data() as Order) as Order[])
    : await readFallbackOrders();
  return orders.find((o) => o.trackingToken === token);
}

export async function updateOrderStatus(id: string, status: DeliveryStatus, updatedBy: string) {
  const current = await getOrderById(id);
  if (!current) return null;
  const next = { ...current, status, updatedAt: nowIso(), updatedBy };
  if (ordersCollection) {
    await ordersCollection.doc(id).set(next);
    await runAutoAllocation();
  } else {
    const orders = await readFallbackOrders();
    const updated = orders.map((o) => (o.id === id ? next : o));
    const allocated = await applyAutoAllocationToOrders(updated);
    await writeFallbackPayload(allocated);
  }
  return next;
}

export async function assignDriver(id: string, driverId: string, updatedBy: string) {
  const current = await getOrderById(id);
  const driver = await findDriverById(driverId);
  if (!current || !driver) return null;
  const prof = await getDriverProfile(driverId);
  if (prof.onboardingStatus !== "approved") {
    return null;
  }
  const next: Order = {
    ...current,
    driverId,
    driverName: driver.name,
    status: current.status === "scheduled" ? "assigned" : current.status,
    updatedAt: nowIso(),
    updatedBy,
  };
  if (ordersCollection) {
    await ordersCollection.doc(id).set(next);
    const snap = await ordersCollection.get();
    const all = snap.docs.map((d) => d.data() as Order);
    const routed = assignStopSequences(all);
    await Promise.all(routed.map((o) => ordersCollection.doc(o.id).set(o)));
  } else {
    const orders = await readFallbackOrders();
    const updated = orders.map((o) => (o.id === id ? next : o));
    await writeFallbackPayload(assignStopSequences(updated));
  }
  return (await getOrderById(id)) ?? null;
}

export async function updateDriverLocation(
  id: string,
  lat: number,
  lng: number,
  etaMinutes: number | undefined,
  updatedBy: string,
) {
  const current = await getOrderById(id);
  if (!current) return null;
  const next: Order = {
    ...current,
    status: current.status === "assigned" ? "en_route" : current.status,
    latestLocation: { lat, lng, updatedAt: nowIso() },
    etaMinutes,
    updatedAt: nowIso(),
    updatedBy,
  };
  if (ordersCollection) {
    await ordersCollection.doc(id).set(next);
  } else {
    const orders = await readFallbackOrders();
    const updated = orders.map((o) => (o.id === id ? next : o));
    await writeFallbackPayload(updated);
  }
  return next;
}

export async function saveProofPhoto(id: string, proofPhotoUrl: string, updatedBy: string) {
  const current = await getOrderById(id);
  if (!current) return null;
  let storedUrl = proofPhotoUrl;
  if (proofPhotoUrl.trim().startsWith("data:")) {
    const uploaded = await uploadProofDataUrl(proofPhotoUrl, id);
    if (uploaded) storedUrl = uploaded;
  }
  const next: Order = {
    ...current,
    proofPhotoUrl: storedUrl,
    status: "delivered",
    updatedAt: nowIso(),
    updatedBy,
  };
  if (ordersCollection) {
    await ordersCollection.doc(id).set(next);
    const snap = await ordersCollection.get();
    const all = snap.docs.map((d) => d.data() as Order);
    const routed = assignStopSequences(all);
    await Promise.all(routed.map((o) => ordersCollection.doc(o.id).set(o)));
  } else {
    const orders = await readFallbackOrders();
    const updated = orders.map((o) => (o.id === id ? next : o));
    await writeFallbackPayload(assignStopSequences(updated));
  }
  return next;
}

export async function reopenOrderAsAssigned(id: string, updatedBy: string) {
  const current = await getOrderById(id);
  if (!current) return null;
  const next: Order = {
    ...current,
    status: "assigned",
    updatedAt: nowIso(),
    updatedBy,
  };
  delete next.proofPhotoUrl;
  delete next.latestLocation;
  if (ordersCollection) {
    await ordersCollection.doc(id).set(next);
    await runAutoAllocation();
  } else {
    const orders = await readFallbackOrders();
    const updated = orders.map((o) => (o.id === id ? next : o));
    const allocated = await applyAutoAllocationToOrders(updated);
    await writeFallbackPayload(allocated);
  }
  return next;
}
