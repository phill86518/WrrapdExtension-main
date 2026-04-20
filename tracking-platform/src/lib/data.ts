import { randomBytes, randomUUID } from "crypto";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { Order, DeliveryStatus, OrdersFilePayload } from "@/lib/types";
import { getFirestoreDb } from "@/lib/firebase-admin";
import { buildDemoSeedOrders } from "@/lib/demo-orders";
import { computeAssignmentsForOrders } from "@/lib/allocation";
import {
  parseScheduledForInput,
  validateScheduledInstant,
  wrrapdScheduledInstantFromAmazonDeliveryDateKey,
} from "@/lib/scheduling";
import { getDriverProfile } from "@/lib/driver-profiles";
import { assignStopSequences } from "@/lib/route-optimization";
import { formatDateKeyNy } from "@/lib/ny-date";
import { findDriverById, listRegisteredDrivers } from "@/lib/driver-registry";
import { uploadProofDataUrl } from "@/lib/proof-storage";
import type { CollectionReference } from "firebase-admin/firestore";
import type { OrderLineItem } from "@/lib/types";

const nowIso = () => new Date().toISOString();
const TRACKING_MERGE_VERSION = "tracking-merge-v2026-04-20-e1";

const ORDERS_FILE_VERSION = 4;

/** Lazy so a bad FIREBASE_PRIVATE_KEY does not 500 every route at import time. */
let ordersFirestoreRef: CollectionReference | null | undefined;
function getOrdersCollection(): CollectionReference | null {
  if (ordersFirestoreRef !== undefined) return ordersFirestoreRef;
  try {
    const db = getFirestoreDb();
    ordersFirestoreRef = db ? db.collection("orders") : null;
  } catch (err) {
    console.error("[data] Firestore orders collection init failed:", err);
    ordersFirestoreRef = null;
  }
  return ordersFirestoreRef;
}

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
  const oc = getOrdersCollection();
  if (oc) {
    const snap = await oc.get();
    const orders = snap.docs.map((d) => d.data() as Order);
    const next = await applyAutoAllocationToOrders(orders);
    await Promise.all(next.map((o) => oc.doc(o.id).set(o)));
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
  const oc = getOrdersCollection();
  if (oc) {
    const snap = await oc.get();
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
    await Promise.all(allocated.map((o) => oc.doc(o.id).set(o)));
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

/**
 * Amazon-style refs sometimes repeat with a pack-line suffix (`…-6778201-01`).
 * Treat the base id as one logical order for ingest dedupe.
 */
export function canonicalExternalOrderId(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const s = raw.trim();
  const parts = s.split("-");
  if (parts.length >= 4 && /^\d{1,4}$/.test(parts[parts.length - 1]!)) {
    return parts.slice(0, -1).join("-");
  }
  return s;
}

function externalOrderIdVariants(id: string): string[] {
  const t = id.trim();
  const c = canonicalExternalOrderId(t);
  return c && c !== t ? [t, c] : [t];
}

function externalOrderIdsOverlap(a: string | undefined, b: string | undefined): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const setB = new Set(externalOrderIdVariants(b));
  return externalOrderIdVariants(a).some((x) => setB.has(x));
}

const OPEN_INGEST_STATUSES = new Set<DeliveryStatus>(["scheduled", "assigned", "en_route"]);

/** Sort comparator: best candidate first (en_route > assigned > scheduled, then freshest, stable id). */
function compareMergePrimary(a: Order, b: Order): number {
  const pri = (s: Order["status"]) =>
    s === "en_route" ? 3 : s === "assigned" ? 2 : s === "scheduled" ? 1 : 0;
  const dp = pri(b.status) - pri(a.status);
  if (dp !== 0) return dp;
  const ta = new Date(a.updatedAt || a.createdAt).getTime();
  const tb = new Date(b.updatedAt || b.createdAt).getTime();
  if (ta !== tb) return tb - ta;
  return a.id.localeCompare(b.id);
}

/** All open orders whose external id matches `externalRaw` or its canonical Amazon base. */
async function findOpenOrdersForIngestMerge(
  externalRaw: string | undefined,
  fallbackOrders?: Order[],
): Promise<Order[]> {
  if (!externalRaw?.trim()) return [];
  const variants = [...new Set(externalOrderIdVariants(externalRaw))];
  const oc = getOrdersCollection();
  if (oc) {
    const byId = new Map<string, Order>();
    for (const v of variants) {
      const snap = await oc.where("externalOrderId", "==", v).limit(20).get();
      for (const d of snap.docs) {
        const o = d.data() as Order;
        if (OPEN_INGEST_STATUSES.has(o.status)) byId.set(o.id, o);
      }
    }
    return [...byId.values()];
  }
  const orders = fallbackOrders ?? (await readFallbackOrders());
  const out: Order[] = [];
  for (const o of orders) {
    if (!o.externalOrderId || !OPEN_INGEST_STATUSES.has(o.status)) continue;
    if (externalOrderIdsOverlap(o.externalOrderId, externalRaw)) out.push(o);
  }
  return out;
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
  customerEmail?: string;
  customerGreetingName?: string;
  amazonDeliveryDatesSnapshot?: string[];
  deliveryPreferencePending?: boolean;
  deliveryPreferenceRespondBy?: string;
  lineItems?: OrderLineItem[];
  /** Admin / internal creates: set true to skip thank-you email & SMS */
  skipCustomerNotifications?: boolean;
};

export async function createOrder(
  input: CreateOrderInput,
): Promise<
  | { ok: true; order: Order; notify?: import("@/lib/post-order-notify").PostOrderNotifySummary }
  | { ok: false; error: string }
> {
  const scheduledAt = parseScheduledForInput(input.scheduledFor);
  const check = validateScheduledInstant(scheduledAt);
  if (!check.ok) {
    return { ok: false, error: check.message };
  }
  const scheduledIso = scheduledAt.toISOString();

  const storedExt =
    input.externalOrderId?.trim()
      ? (canonicalExternalOrderId(input.externalOrderId.trim()) ?? input.externalOrderId.trim())
      : undefined;

  const existingMatches =
    storedExt && input.externalOrderId?.trim()
      ? await findOpenOrdersForIngestMerge(input.externalOrderId)
      : [];

  if (existingMatches.length > 0) {
    const existingOpen = [...existingMatches].sort(compareMergePrimary)[0]!;
    const prefToken =
      input.deliveryPreferencePending === true
        ? randomBytes(32).toString("base64url")
        : undefined;
    const nextEmail = input.customerEmail?.trim() || existingOpen.customerEmail?.trim();
    /**
     * Extension "staging simulate place order" sends one ingest per cart line with ids like
     * `…-6778201-01`, which canonicalize to the same Amazon base as process-payment (`…-6778201`).
     * That merge was overwriting the checkout-confirmed giftee (pay flow) with Amazon-line defaults.
     */
    const incomingStagingSimulate = /staging simulate place order/i.test(input.sourceNote || "");
    const existingFromStagingSimulate = /staging simulate place order/i.test(
      existingOpen.sourceNote || "",
    );
    /** Staging re-ingest must not clobber pay/checkout ingest (giftee, Wrrapd +1 schedule, Amazon snapshot). */
    const preserveCheckoutAgainstStaging =
      incomingStagingSimulate && !existingFromStagingSimulate;
    const preserveGifteeFields =
      preserveCheckoutAgainstStaging &&
      Boolean(
        (existingOpen.recipientName || "").trim() && (existingOpen.addressLine1 || "").trim(),
      );
    const merged: Order = {
      ...existingOpen,
      scheduledFor: preserveCheckoutAgainstStaging
        ? existingOpen.scheduledFor || scheduledIso
        : scheduledIso,
      externalOrderId: storedExt,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      recipientName: preserveGifteeFields ? existingOpen.recipientName : input.recipientName,
      addressLine1: preserveGifteeFields ? existingOpen.addressLine1 : input.addressLine1,
      addressLine2: preserveGifteeFields
        ? existingOpen.addressLine2
        : input.addressLine2?.trim()
          ? input.addressLine2.trim()
          : existingOpen.addressLine2,
      city: preserveGifteeFields ? existingOpen.city : input.city,
      state: preserveGifteeFields ? existingOpen.state : input.state,
      postalCode: preserveGifteeFields ? existingOpen.postalCode : input.postalCode,
      sourceNote: preserveCheckoutAgainstStaging
        ? `${existingOpen.sourceNote || (input.sourceNote ?? existingOpen.sourceNote) || "Ingest merge"} [${TRACKING_MERGE_VERSION}]`
        : `${input.sourceNote ?? existingOpen.sourceNote ?? "Ingest merge"} [${TRACKING_MERGE_VERSION}]`,
      updatedAt: nowIso(),
      updatedBy: TRACKING_MERGE_VERSION,
    };
    if (nextEmail) merged.customerEmail = nextEmail;
    else delete merged.customerEmail;
    if (input.customerGreetingName?.trim()) {
      merged.customerGreetingName = input.customerGreetingName.trim();
    }
    if (input.amazonDeliveryDatesSnapshot?.length && !preserveCheckoutAgainstStaging) {
      merged.amazonDeliveryDatesSnapshot = [...input.amazonDeliveryDatesSnapshot];
    }
    if (input.lineItems?.length) {
      merged.lineItems = [...input.lineItems];
    }
    if (!preserveCheckoutAgainstStaging) {
      if (input.deliveryPreferencePending === true && prefToken) {
        merged.deliveryPreferencePending = true;
        if (input.deliveryPreferenceRespondBy) {
          merged.deliveryPreferenceRespondBy = input.deliveryPreferenceRespondBy;
        }
        merged.deliveryPreferenceToken =
          existingOpen.deliveryPreferencePending === true && existingOpen.deliveryPreferenceToken
            ? existingOpen.deliveryPreferenceToken
            : prefToken;
      } else if (input.deliveryPreferencePending === false) {
        delete merged.deliveryPreferencePending;
        delete merged.deliveryPreferenceRespondBy;
        delete merged.deliveryPreferenceToken;
      }
    }

    const ocMerge = getOrdersCollection();
    if (ocMerge) {
      await ocMerge.doc(existingOpen.id).set(merged);
      const dupIds = existingMatches.map((o) => o.id).filter((id) => id !== existingOpen.id);
      await Promise.all(dupIds.map((id) => ocMerge.doc(id).delete()));
      await runAutoAllocation();
    } else {
      const orders = await readFallbackOrders();
      const filtered = orders.filter((o) => !existingMatches.some((m) => m.id === o.id));
      filtered.push(merged);
      const next = await applyAutoAllocationToOrders(filtered);
      await writeFallbackPayload(next);
    }
    const saved = await getOrderById(existingOpen.id);
    const finalOrder = saved ?? merged;
    let notify: import("@/lib/post-order-notify").PostOrderNotifySummary | undefined;
    if (!input.skipCustomerNotifications) {
      const smtpEnvPresent = !!(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim());
      const mailgunEnvPresent = !!(
        process.env.MAILGUN_API_KEY?.trim() && process.env.MAILGUN_DOMAIN?.trim()
      );
      const twilioEnvPresent = !!(
        process.env.TWILIO_ACCOUNT_SID?.trim() &&
        process.env.TWILIO_AUTH_TOKEN?.trim() &&
        process.env.TWILIO_SMS_FROM?.trim()
      );
      notify = {
        skipped: true,
        skipReason: "merged-open-order-by-external-id",
        mailgunEnvPresent,
        smtpEnvPresent,
        twilioEnvPresent,
        customerThankYouEmailSent: false,
        adminEmailsSent: 0,
        customerSmsSent: false,
        message: "Skipped notifications (updated existing open order with same external reference)",
      };
    }
    return { ok: true, order: finalOrder, ...(notify ? { notify } : {}) };
  }

  /** Distinct from Amazon order ids; high-entropy (not ord-1234). */
  const id = `wrr-${randomBytes(10).toString("hex")}`;
  const prefToken =
    input.deliveryPreferencePending === true
      ? randomBytes(32).toString("base64url")
      : undefined;
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
    externalOrderId: storedExt ?? input.externalOrderId,
    ...(input.customerEmail ? { customerEmail: input.customerEmail.trim() } : {}),
    ...(input.customerGreetingName?.trim()
      ? { customerGreetingName: input.customerGreetingName.trim() }
      : {}),
    ...(input.amazonDeliveryDatesSnapshot?.length
      ? { amazonDeliveryDatesSnapshot: [...input.amazonDeliveryDatesSnapshot] }
      : {}),
    ...(input.deliveryPreferencePending === true && prefToken
      ? {
          deliveryPreferencePending: true,
          ...(input.deliveryPreferenceRespondBy
            ? { deliveryPreferenceRespondBy: input.deliveryPreferenceRespondBy }
            : {}),
          deliveryPreferenceToken: prefToken,
        }
      : {}),
    ...(input.lineItems?.length ? { lineItems: [...input.lineItems] } : {}),
  };
  const ocCreate = getOrdersCollection();
  if (ocCreate) {
    await ocCreate.doc(order.id).set(order);
    await runAutoAllocation();
  } else {
    const orders = await readFallbackOrders();
    orders.push(order);
    const next = await applyAutoAllocationToOrders(orders);
    await writeFallbackPayload(next);
  }
  const saved = await getOrderById(order.id);
  const finalOrder = saved ?? order;
  let notify: import("@/lib/post-order-notify").PostOrderNotifySummary | undefined;
  if (!input.skipCustomerNotifications) {
    try {
      const m = await import("@/lib/post-order-notify");
      notify = await m.sendPostOrderNotifications(finalOrder);
    } catch (e) {
      console.error("[post-order-notify]", e);
      notify = {
        skipped: false,
        mailgunEnvPresent: false,
        smtpEnvPresent: false,
        twilioEnvPresent: false,
        customerThankYouEmailSent: false,
        adminEmailsSent: 0,
        customerSmsSent: false,
        message: `notify threw: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }
  return { ok: true, order: finalOrder, ...(notify ? { notify } : {}) };
}

export async function listOrdersByStatus(status: "active" | "scheduled" | "past") {
  const oc = getOrdersCollection();
  const raw = oc
    ? ((await oc.get()).docs.map((doc) => doc.data() as Order) as Order[])
    : await readFallbackOrders();
  const orders = assignStopSequences(raw);
  if (status === "active") {
    return orders.filter((o) => o.status === "assigned" || o.status === "en_route");
  }
  if (status === "scheduled") {
    return orders.filter((o) => o.status === "scheduled");
  }
  return orders.filter((o) => o.status === "delivered" || o.status === "cancelled");
}

export async function listAllOrders(): Promise<Order[]> {
  const oc = getOrdersCollection();
  if (oc) {
    const snap = await oc.get();
    return snap.docs.map((d) => d.data() as Order);
  }
  return readFallbackOrders();
}

export async function listDriverOrders(driverId: string) {
  const profile = await getDriverProfile(driverId);
  if (profile.onboardingStatus !== "approved") {
    return [];
  }
  const oc = getOrdersCollection();
  const raw = oc
    ? ((await oc.get()).docs.map((doc) => doc.data() as Order) as Order[])
    : await readFallbackOrders();
  const orders = assignStopSequences(raw);
  const mine = orders.filter(
    (o) =>
      o.driverId === driverId &&
      (o.status === "assigned" || o.status === "en_route" || o.status === "scheduled"),
  );
  return mine.sort((a, b) => {
    const da = formatDateKeyNy(a.scheduledFor);
    const db = formatDateKeyNy(b.scheduledFor);
    if (da !== db) return da.localeCompare(db);
    const sa = a.stopSequence ?? 9999;
    const sb = b.stopSequence ?? 9999;
    if (sa !== sb) return sa - sb;
    return a.id.localeCompare(b.id);
  });
}

/** Delivered / cancelled orders for this driver (most recent first). Same data model as admin. */
export async function listDriverPastOrders(driverId: string, limit = 80): Promise<Order[]> {
  const profile = await getDriverProfile(driverId);
  if (profile.onboardingStatus !== "approved") {
    return [];
  }
  const oc = getOrdersCollection();
  const orders = oc
    ? ((await oc.get()).docs.map((doc) => doc.data() as Order) as Order[])
    : await readFallbackOrders();
  const mine = orders.filter(
    (o) =>
      o.driverId === driverId &&
      (o.status === "delivered" || o.status === "cancelled"),
  );
  mine.sort((a, b) => {
    const ta = new Date(a.updatedAt || a.scheduledFor).getTime();
    const tb = new Date(b.updatedAt || b.scheduledFor).getTime();
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });
  return mine.slice(0, limit);
}

export async function getOrderById(id: string) {
  const oc = getOrdersCollection();
  if (oc) {
    const snap = await oc.doc(id).get();
    return snap.exists ? (snap.data() as Order) : undefined;
  }
  const orders = await readFallbackOrders();
  return orders.find((o) => o.id === id);
}

export async function getOrderByTrackingToken(token: string) {
  const oc = getOrdersCollection();
  const orders = oc
    ? ((await oc.get()).docs.map((doc) => doc.data() as Order) as Order[])
    : await readFallbackOrders();
  return orders.find((o) => o.trackingToken === token);
}

export async function getOrderByDeliveryPreferenceToken(token: string): Promise<Order | undefined> {
  if (!token.trim()) return undefined;
  const oc = getOrdersCollection();
  if (oc) {
    const snap = await oc.where("deliveryPreferenceToken", "==", token.trim()).limit(1).get();
    if (!snap.empty) return snap.docs[0]!.data() as Order;
    return undefined;
  }
  const orders = await readFallbackOrders();
  return orders.find((o) => o.deliveryPreferenceToken === token.trim());
}

export async function resolveDeliveryPreferenceByToken(
  token: string,
  choice: "together" | "earliest",
): Promise<{ ok: true; order: Order } | { ok: false; error: string }> {
  const current = await getOrderByDeliveryPreferenceToken(token);
  if (!current?.deliveryPreferencePending) {
    return { ok: false, error: "This link is invalid or your choice was already recorded." };
  }
  const days = current.amazonDeliveryDatesSnapshot;
  if (!days?.length) {
    return { ok: false, error: "Order is missing Amazon date data." };
  }
  const sorted = [...new Set(days.map((d) => d.trim()))].filter(Boolean).sort();
  if (sorted.length < 2) {
    return { ok: false, error: "No multi-date choice is needed for this order." };
  }
  const pick = choice === "together" ? sorted[sorted.length - 1]! : sorted[0]!;
  let scheduledIso: string;
  try {
    scheduledIso = wrrapdScheduledInstantFromAmazonDeliveryDateKey(pick);
  } catch {
    return { ok: false, error: "Could not compute schedule from Amazon dates." };
  }
  const scheduledAt = parseScheduledForInput(scheduledIso);
  const check = validateScheduledInstant(scheduledAt);
  if (!check.ok) {
    return { ok: false, error: check.message };
  }
  const next: Order = {
    ...current,
    scheduledFor: scheduledAt.toISOString(),
    deliveryPreferencePending: false,
    deliveryPreferenceChoice: choice,
    updatedAt: nowIso(),
    updatedBy: "customer-delivery-preference",
  };
  const oc = getOrdersCollection();
  if (oc) {
    await oc.doc(next.id).set(next);
    await runAutoAllocation();
  } else {
    const orders = await readFallbackOrders();
    const updated = orders.map((o) => (o.id === next.id ? next : o));
    const allocated = await applyAutoAllocationToOrders(updated);
    await writeFallbackPayload(allocated);
  }
  return { ok: true, order: (await getOrderById(next.id)) ?? next };
}

/** After EOD deadline: keep combined (last Amazon date) schedule; clear pending flag. */
export async function expireStaleDeliveryPreferences(): Promise<number> {
  const nowMs = Date.now();
  const oc = getOrdersCollection();
  const orders = await listAllOrders();
  const toClose: Order[] = [];
  for (const o of orders) {
    if (!o.deliveryPreferencePending || !o.deliveryPreferenceRespondBy) continue;
    if (nowMs <= new Date(o.deliveryPreferenceRespondBy).getTime()) continue;
    toClose.push({
      ...o,
      deliveryPreferencePending: false,
      deliveryPreferenceChoice: "together_deadline_default",
      updatedAt: nowIso(),
      updatedBy: "delivery-preference-deadline",
    });
  }
  if (toClose.length === 0) return 0;
  if (oc) {
    await Promise.all(toClose.map((next) => oc.doc(next.id).set(next)));
    await runAutoAllocation();
  } else {
    const all = await readFallbackOrders();
    const closeMap = new Map(toClose.map((n) => [n.id, n] as const));
    const merged = all.map((x) => closeMap.get(x.id) ?? x);
    const allocated = await applyAutoAllocationToOrders(merged);
    await writeFallbackPayload(allocated);
  }
  return toClose.length;
}

export async function updateOrderStatus(id: string, status: DeliveryStatus, updatedBy: string) {
  const current = await getOrderById(id);
  if (!current) return null;
  const next = { ...current, status, updatedAt: nowIso(), updatedBy };
  const ocUp = getOrdersCollection();
  if (ocUp) {
    await ocUp.doc(id).set(next);
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
  const next: Order = {
    ...current,
    driverId,
    driverName: driver.name,
    status: current.status === "scheduled" ? "assigned" : current.status,
    updatedAt: nowIso(),
    updatedBy,
  };
  const ocAs = getOrdersCollection();
  if (ocAs) {
    await ocAs.doc(id).set(next);
    const snap = await ocAs.get();
    const all = snap.docs.map((d) => d.data() as Order);
    const routed = assignStopSequences(all);
    await Promise.all(routed.map((o) => ocAs.doc(o.id).set(o)));
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
  const ocLoc = getOrdersCollection();
  if (ocLoc) {
    await ocLoc.doc(id).set(next);
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
  const ocProof = getOrdersCollection();
  if (ocProof) {
    await ocProof.doc(id).set(next);
    const snap = await ocProof.get();
    const all = snap.docs.map((d) => d.data() as Order);
    const routed = assignStopSequences(all);
    await Promise.all(routed.map((o) => ocProof.doc(o.id).set(o)));
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
  const ocRe = getOrdersCollection();
  if (ocRe) {
    await ocRe.doc(id).set(next);
    await runAutoAllocation();
  } else {
    const orders = await readFallbackOrders();
    const updated = orders.map((o) => (o.id === id ? next : o));
    const allocated = await applyAutoAllocationToOrders(updated);
    await writeFallbackPayload(allocated);
  }
  return next;
}

export async function deleteOrders(ids: string[], updatedBy: string) {
  void updatedBy;
  const uniq = [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
  if (!uniq.length) return 0;
  const oc = getOrdersCollection();
  if (oc) {
    await Promise.all(uniq.map((id) => oc.doc(id).delete()));
    return uniq.length;
  }
  const orders = await readFallbackOrders();
  const keep = orders.filter((o) => !uniq.includes(o.id));
  await writeFallbackPayload(keep);
  return uniq.length;
}
