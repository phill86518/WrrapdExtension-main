import { NextRequest, NextResponse } from "next/server";
import { requireWrapstarSession } from "@/lib/auth";
import { getActiveShift, registerVideoSegment } from "@/lib/shift-store";
import {
  createSignedVideoUploadUrl,
  finalizeStorageObject,
  MAX_VIDEO_BYTES,
  uploadVideoBuffer,
} from "@/lib/proof-storage";
import { getOrderById } from "@/lib/data";

/** Upload a live MediaRecorder timeslice to GCS while wrapping is in progress. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const session = await requireWrapstarSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orderId } = await params;
  const shift = await getActiveShift(session.userId);
  if (!shift) {
    return NextResponse.json({ error: "No active shift." }, { status: 400 });
  }
  const order = await getOrderById(orderId);
  if (!order || (order.wrapPhase !== "recording" && order.wrapPhase !== "label_ready")) {
    return NextResponse.json({ error: "Order is not recording." }, { status: 400 });
  }

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as {
      action?: "sign" | "complete";
      segmentIndex?: number;
      contentType?: string;
      objectPath?: string;
      byteSize?: number;
    };
    if (body.action === "sign") {
      const signed = await createSignedVideoUploadUrl({
        shiftId: shift.id,
        giftId: orderId,
        segmentIndex: Number(body.segmentIndex ?? 0),
        contentType: body.contentType,
      });
      if (!signed) {
        return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
      }
      return NextResponse.json({ ok: true, signed });
    }
    if (body.action === "complete" && body.objectPath) {
      const finalized = await finalizeStorageObject(
        body.objectPath,
        body.contentType || "video/webm",
      );
      const result = await registerVideoSegment({
        shiftId: shift.id,
        orderId,
        wrapstarId: session.userId,
        segmentIndex: Number(body.segmentIndex ?? 0),
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationSec: 0,
        storagePath: body.objectPath,
        downloadUrl: finalized?.downloadUrl,
        contentType: body.contentType || "video/webm",
        byteSize: body.byteSize,
        kind: "live_chunk",
      });
      return NextResponse.json(result.ok ? { ok: true, video: result.video } : { error: result.error });
    }
  }

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("chunk");
    const segmentIndex = Number(form.get("segmentIndex") ?? 0);
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "chunk required" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (!buf.length || buf.length > MAX_VIDEO_BYTES) {
      return NextResponse.json({ error: "Invalid chunk size" }, { status: 400 });
    }
    const uploaded = await uploadVideoBuffer({
      shiftId: shift.id,
      giftId: orderId,
      segmentIndex,
      buffer: buf,
      contentType: file.type || "video/webm",
    });
    const result = await registerVideoSegment({
      shiftId: shift.id,
      orderId,
      wrapstarId: session.userId,
      segmentIndex,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationSec: 0,
      storagePath: uploaded?.objectPath,
      downloadUrl: uploaded?.downloadUrl,
      contentType: file.type || "video/webm",
      byteSize: buf.length,
      kind: "live_chunk",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, video: result.video });
  }

  return NextResponse.json({ error: "Unsupported body" }, { status: 400 });
}
