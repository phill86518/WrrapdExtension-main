import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { Order, WrapStarShift, WrapStarShiftVideo } from "./types";
import {
  trackingWrapstarShiftsCollection,
  trackingWrapstarShiftVideosCollection,
} from "./tracking-firestore";
import { formatDateKeyNy } from "./ny-date";
import { wrrapdScheduledInstantIsoForUi } from "./order-schedule-display";
import { getOrderById, listWrapstarOrders, patchOrderFields } from "./data";
import { generateDriverLabelQr, newDriverLabelToken } from "./driver-label-qr";

const DATA_DIR = path.join(process.cwd(), ".data");
const SHIFTS_FILE = path.join(DATA_DIR, "wrapstar-shifts.json");
const VIDEOS_FILE = path.join(DATA_DIR, "wrapstar-shift-videos.json");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJsonArray<T>(file: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeJsonArray<T>(file: string, list: T[]) {
  await ensureDir();
  await fs.writeFile(file, JSON.stringify(list, null, 2), "utf8");
}

function newId(prefix: string) {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

function todaysOrders(orders: Order[], dateKey: string): Order[] {
  return orders
    .filter((o) => formatDateKeyNy(wrrapdScheduledInstantIsoForUi(o)) === dateKey)
    .sort((a, b) => {
      const sa = a.stopSequence ?? 9999;
      const sb = b.stopSequence ?? 9999;
      if (sa !== sb) return sa - sb;
      return a.id.localeCompare(b.id);
    });
}

export async function getActiveShift(wrapstarId: string): Promise<WrapStarShift | null> {
  const col = trackingWrapstarShiftsCollection();
  if (col) {
    const snap = await col.where("wrapstarId", "==", wrapstarId).limit(40).get();
    const rows = snap.docs
      .map((d) => d.data() as WrapStarShift)
      .filter((s) => s.status === "active")
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return rows[0] ?? null;
  }
  const all = await readJsonArray<WrapStarShift>(SHIFTS_FILE);
  return (
    all
      .filter((s) => s.wrapstarId === wrapstarId && s.status === "active")
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null
  );
}

async function saveShift(shift: WrapStarShift): Promise<WrapStarShift> {
  const col = trackingWrapstarShiftsCollection();
  if (col) {
    await col.doc(shift.id).set(shift);
    return shift;
  }
  const all = await readJsonArray<WrapStarShift>(SHIFTS_FILE);
  const idx = all.findIndex((s) => s.id === shift.id);
  if (idx >= 0) all[idx] = shift;
  else all.push(shift);
  await writeJsonArray(SHIFTS_FILE, all);
  return shift;
}

export async function startShift(wrapstarId: string): Promise<
  { ok: true; shift: WrapStarShift; orders: Order[] } | { ok: false; error: string }
> {
  const existing = await getActiveShift(wrapstarId);
  const dateKey = formatDateKeyNy(new Date());
  const allMine = await listWrapstarOrders(wrapstarId);
  const today = todaysOrders(allMine, dateKey);

  if (existing) {
    const orders = await loadShiftOrders(existing);
    return { ok: true, shift: existing, orders };
  }

  if (today.length === 0) {
    return { ok: false, error: "No wrap jobs assigned for today. Check Admin assignment." };
  }

  const now = new Date().toISOString();
  const shift: WrapStarShift = {
    id: newId("shf"),
    wrapstarId,
    dateKey,
    startedAt: now,
    status: "active",
    orderIds: today.map((o) => o.id),
    createdAt: now,
    updatedAt: now,
  };
  await saveShift(shift);

  for (let i = 0; i < today.length; i++) {
    const o = today[i]!;
    if (o.wrapPhase === "complete") continue;
    await patchOrderFields(o.id, {
      wrapShiftId: shift.id,
      wrapPhase: o.wrapPhase === "recording" || o.wrapPhase === "label_ready" ? o.wrapPhase : "queued",
    }, wrapstarId);
  }

  const orders = await loadShiftOrders(shift);
  return { ok: true, shift, orders };
}

async function loadShiftOrders(shift: WrapStarShift): Promise<Order[]> {
  const rows: Order[] = [];
  for (const id of shift.orderIds) {
    const o = await getOrderById(id);
    if (o) rows.push(o);
  }
  return rows.sort((a, b) => {
    const sa = a.stopSequence ?? shift.orderIds.indexOf(a.id) + 1;
    const sb = b.stopSequence ?? shift.orderIds.indexOf(b.id) + 1;
    return sa - sb;
  });
}

export async function confirmPrints(wrapstarId: string): Promise<
  { ok: true; shift: WrapStarShift } | { ok: false; error: string }
> {
  const shift = await getActiveShift(wrapstarId);
  if (!shift) return { ok: false, error: "No active shift." };
  const now = new Date().toISOString();
  const next = { ...shift, printsConfirmedAt: now, updatedAt: now };
  await saveShift(next);
  return { ok: true, shift: next };
}

export async function getActiveShiftBundle(wrapstarId: string): Promise<{
  shift: WrapStarShift | null;
  orders: Order[];
  videos: WrapStarShiftVideo[];
}> {
  const shift = await getActiveShift(wrapstarId);
  if (!shift) return { shift: null, orders: [], videos: [] };
  const orders = await loadShiftOrders(shift);
  const videos = await listVideosForShift(shift.id);
  return { shift, orders, videos };
}

function priorOrdersComplete(orders: Order[], orderId: string): boolean {
  const idx = orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return false;
  for (let i = 0; i < idx; i++) {
    if (orders[i]!.wrapPhase !== "complete") return false;
  }
  return true;
}

export async function startOrderVideo(
  wrapstarId: string,
  orderId: string,
): Promise<{ ok: true; order: Order } | { ok: false; error: string }> {
  const shift = await getActiveShift(wrapstarId);
  if (!shift) return { ok: false, error: "No active shift." };
  if (!shift.printsConfirmedAt) {
    return { ok: false, error: "Print all custom/AI wrap papers first, then confirm." };
  }
  if (!shift.orderIds.includes(orderId)) {
    return { ok: false, error: "Order is not on today's shift list." };
  }
  const orders = await loadShiftOrders(shift);
  if (!priorOrdersComplete(orders, orderId)) {
    return { ok: false, error: "Finish the previous order in sequence before starting this one." };
  }
  const order = orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (order.wrapPhase === "complete") {
    return { ok: false, error: "This order is already complete." };
  }

  const now = new Date().toISOString();
  const updated = await patchOrderFields(
    orderId,
    {
      wrapShiftId: shift.id,
      wrapPhase: "recording",
      wrapVideoStartedAt: order.wrapVideoStartedAt || now,
      status: "in_progress",
    },
    wrapstarId,
  );
  if (!updated) return { ok: false, error: "Could not update order." };
  return { ok: true, order: updated };
}

export async function finishWrapping(
  wrapstarId: string,
  orderId: string,
): Promise<
  | { ok: true; order: Order; barcodeDataUrl: string; payload: unknown }
  | { ok: false; error: string }
> {
  const shift = await getActiveShift(wrapstarId);
  if (!shift) return { ok: false, error: "No active shift." };
  const order = await getOrderById(orderId);
  if (!order || orderWrapstarMismatch(order, wrapstarId)) {
    return { ok: false, error: "Order not found for this WrapStar." };
  }
  if (order.wrapPhase !== "recording" && order.wrapPhase !== "label_ready") {
    return { ok: false, error: "Start video before finishing wrapping." };
  }

  const token = order.driverLabelToken || newDriverLabelToken();
  const qr = await generateDriverLabelQr(order, token);
  const now = new Date().toISOString();
  const needsCourier =
    order.fulfillmentMode === "driver_final_mile" || Boolean(order.courierDriverId);
  const updated = await patchOrderFields(
    orderId,
    {
      wrapPhase: "label_ready",
      wrapFinishedAt: now,
      driverLabelToken: token,
      driverLabelQrUrl: qr.storedUrl || undefined,
      // Courier can pick up once the box QR exists; video end still marks wrap complete.
      ...(needsCourier && !order.readyForCourierAt ? { readyForCourierAt: now } : {}),
    },
    wrapstarId,
  );
  if (!updated) return { ok: false, error: "Could not save label." };
  return {
    ok: true,
    order: updated,
    barcodeDataUrl: qr.barcodeDataUrl,
    payload: qr.payload,
  };
}

export async function endOrderVideo(
  wrapstarId: string,
  orderId: string,
  opts?: { videoUrl?: string; storagePath?: string },
): Promise<{ ok: true; order: Order } | { ok: false; error: string }> {
  const shift = await getActiveShift(wrapstarId);
  if (!shift) return { ok: false, error: "No active shift." };
  const order = await getOrderById(orderId);
  if (!order || orderWrapstarMismatch(order, wrapstarId)) {
    return { ok: false, error: "Order not found for this WrapStar." };
  }
  if (order.wrapPhase !== "label_ready" && order.wrapPhase !== "complete") {
    return {
      ok: false,
      error: "Click Finished wrapping (print the barcode) before ending video.",
    };
  }
  if (!order.wrapFinishedAt && order.wrapPhase !== "complete") {
    return { ok: false, error: "Barcode was not generated yet." };
  }

  const now = new Date().toISOString();
  const needsCourier =
    order.fulfillmentMode === "driver_final_mile" || Boolean(order.courierDriverId);
  const updated = await patchOrderFields(
    orderId,
    {
      wrapPhase: "complete",
      wrapVideoEndedAt: now,
      readyForCourierAt: now,
      ...(opts?.videoUrl ? { wrapVideoUrl: opts.videoUrl } : {}),
      // Stay in_progress until courier delivers; Admin uses wrapPhase + readyForCourierAt.
      status: "in_progress",
      ...(needsCourier ? { fulfillmentMode: "driver_final_mile" as const } : {}),
    },
    wrapstarId,
  );
  if (!updated) return { ok: false, error: "Could not complete order wrap." };

  if (opts?.videoUrl || opts?.storagePath) {
    await registerVideoSegment({
      shiftId: shift.id,
      orderId,
      wrapstarId,
      segmentIndex: 0,
      startedAt: order.wrapVideoStartedAt || now,
      endedAt: now,
      durationSec: Math.max(
        1,
        Math.round(
          (new Date(now).getTime() - new Date(order.wrapVideoStartedAt || now).getTime()) / 1000,
        ),
      ),
      storagePath: opts.storagePath,
      downloadUrl: opts.videoUrl,
      contentType: "video/webm",
      kind: "final",
    });
  }

  return { ok: true, order: updated };
}

function orderWrapstarMismatch(order: Order, wrapstarId: string) {
  return (order.wrapstarId || order.driverId) !== wrapstarId;
}

export async function listVideosForShift(shiftId: string): Promise<WrapStarShiftVideo[]> {
  const col = trackingWrapstarShiftVideosCollection();
  if (col) {
    const snap = await col.where("shiftId", "==", shiftId).get();
    return snap.docs.map((d) => d.data() as WrapStarShiftVideo);
  }
  const all = await readJsonArray<WrapStarShiftVideo>(VIDEOS_FILE);
  return all.filter((v) => v.shiftId === shiftId);
}

async function saveVideo(video: WrapStarShiftVideo): Promise<WrapStarShiftVideo> {
  const col = trackingWrapstarShiftVideosCollection();
  if (col) {
    await col.doc(video.id).set(video);
    return video;
  }
  const all = await readJsonArray<WrapStarShiftVideo>(VIDEOS_FILE);
  const idx = all.findIndex((v) => v.id === video.id);
  if (idx >= 0) all[idx] = video;
  else all.push(video);
  await writeJsonArray(VIDEOS_FILE, all);
  return video;
}

export async function registerVideoSegment(input: {
  shiftId: string;
  orderId: string;
  wrapstarId: string;
  segmentIndex: number;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  storagePath?: string;
  downloadUrl?: string;
  contentType: string;
  byteSize?: number;
  kind?: "live_chunk" | "final";
}): Promise<{ ok: true; video: WrapStarShiftVideo } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const video: WrapStarShiftVideo = {
    id: newId("vid"),
    shiftId: input.shiftId,
    orderId: input.orderId,
    wrapstarId: input.wrapstarId,
    segmentIndex: input.segmentIndex,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationSec: input.durationSec,
    storagePath: input.storagePath,
    downloadUrl: input.downloadUrl,
    contentType: input.contentType,
    byteSize: input.byteSize,
    kind: input.kind || "live_chunk",
    createdAt: now,
  };
  await saveVideo(video);
  return { ok: true, video };
}

