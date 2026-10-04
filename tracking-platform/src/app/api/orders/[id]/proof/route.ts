import { NextRequest, NextResponse } from "next/server";
import { getSession, isContractorRole } from "@/lib/auth";
import { saveProofPhoto, saveWrapPhoto, type DeliveryProofInput } from "@/lib/data";
import { loadOrderIfMutable } from "@/lib/order-access";

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * kind=wrap (default, legacy driver console + offline queue): wrapped-gift photo, status unchanged.
 * kind=delivery: door / hand-off photo with GPS; marks the order delivered.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || !isContractorRole(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const allowed = await loadOrderIfMutable(session, id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden or not found" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";
  let dataUrl = "";
  let kind = "wrap";
  const proof: DeliveryProofInput = {};

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, unknown>;
    dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
    kind = body.kind === "delivery" ? "delivery" : "wrap";
    proof.lat = num(body.lat);
    proof.lng = num(body.lng);
    proof.accuracyM = num(body.accuracyM);
    proof.handedTo = typeof body.handedTo === "string" ? body.handedTo : undefined;
  } else {
    const formData = await request.formData();
    const file = formData.get("proofPhoto");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File required" }, { status: 400 });
    }
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "image/jpeg";
    dataUrl = `data:${mimeType};base64,${base64}`;
    kind = formData.get("kind") === "delivery" ? "delivery" : "wrap";
    proof.lat = num(formData.get("lat"));
    proof.lng = num(formData.get("lng"));
    proof.accuracyM = num(formData.get("accuracyM"));
    const handedTo = formData.get("handedTo");
    proof.handedTo = typeof handedTo === "string" ? handedTo : undefined;
  }

  if (!dataUrl) {
    return NextResponse.json({ error: "Photo payload required" }, { status: 400 });
  }

  const updatedOrder =
    kind === "delivery"
      ? await saveProofPhoto(id, dataUrl, session.userId, proof)
      : await saveWrapPhoto(id, dataUrl, session.userId);
  return NextResponse.json({ ok: true, order: updatedOrder });
}
