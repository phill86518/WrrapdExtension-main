import { NextRequest, NextResponse } from "next/server";
import { requireWrapstarSession } from "@/lib/auth";
import { endOrderVideo, getActiveShift, registerVideoSegment } from "@/lib/shift-store";
import {
  createSignedVideoUploadUrl,
  finalizeStorageObject,
  MAX_VIDEO_BYTES,
  uploadVideoBuffer,
} from "@/lib/proof-storage";
import { getOrderById } from "@/lib/data";

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
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const contentType = request.headers.get("content-type") || "";
  let videoUrl: string | undefined;
  let storagePath: string | undefined;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("video");
    if (file instanceof File) {
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length > 0 && buf.length <= MAX_VIDEO_BYTES) {
        const uploaded = await uploadVideoBuffer({
          shiftId: shift.id,
          giftId: orderId,
          segmentIndex: 999,
          buffer: buf,
          contentType: file.type || "video/webm",
        });
        videoUrl = uploaded?.downloadUrl;
        storagePath = uploaded?.objectPath;
      }
    }
  } else if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as {
      action?: "sign" | "complete";
      objectPath?: string;
      contentType?: string;
      segmentIndex?: number;
      byteSize?: number;
    };
    if (body.action === "sign") {
      const signed = await createSignedVideoUploadUrl({
        shiftId: shift.id,
        giftId: orderId,
        segmentIndex: Number(body.segmentIndex ?? 999),
        contentType: body.contentType,
      });
      if (!signed) {
        return NextResponse.json({ error: "Video storage unavailable." }, { status: 503 });
      }
      return NextResponse.json({ ok: true, signed });
    }
    if (body.action === "complete" && body.objectPath) {
      const expectedPrefix = `shift-video/${shift.id}/${orderId}/`;
      if (!body.objectPath.startsWith(expectedPrefix)) {
        return NextResponse.json({ error: "Invalid object path." }, { status: 400 });
      }
      const finalized = await finalizeStorageObject(
        body.objectPath,
        body.contentType || "video/webm",
      );
      videoUrl = finalized?.downloadUrl;
      storagePath = body.objectPath;
      await registerVideoSegment({
        shiftId: shift.id,
        orderId,
        wrapstarId: session.userId,
        segmentIndex: Number(body.segmentIndex ?? 999),
        startedAt: order.wrapVideoStartedAt || new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationSec: 0,
        storagePath,
        downloadUrl: videoUrl,
        contentType: body.contentType || "video/webm",
        byteSize: body.byteSize,
        kind: "final",
      });
    }
  }

  const result = await endOrderVideo(session.userId, orderId, { videoUrl, storagePath });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, order: result.order });
}
