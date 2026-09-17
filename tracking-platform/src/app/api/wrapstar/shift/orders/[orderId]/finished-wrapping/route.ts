import { NextResponse } from "next/server";
import { requireWrapActor } from "@/lib/auth";
import { finishWrapping } from "@/lib/shift-store";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const actor = await requireWrapActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orderId } = await params;
  const result = await finishWrapping(actor.wrapstarId, orderId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    order: result.order,
    barcodeDataUrl: result.barcodeDataUrl,
    payload: result.payload,
  });
}
