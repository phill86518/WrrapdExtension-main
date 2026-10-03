import { NextResponse } from "next/server";
import { requireWrapActor } from "@/lib/auth";
import {
  completeItemWrap,
  confirmItemBox,
  confirmItemLabel,
  startItemCamera,
} from "@/lib/shift-store";

export async function POST(request: Request) {
  const actor = await requireWrapActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    itemId?: string;
    action?: "camera" | "box" | "wrapped" | "label";
  };
  const itemId = body.itemId || "";
  if (!itemId) {
    return NextResponse.json({ error: "Missing gift." }, { status: 400 });
  }
  if (body.action === "camera") {
    const result = await startItemCamera(actor.wrapstarId, itemId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, shift: result.shift, item: result.item });
  }
  if (body.action === "box") {
    const result = await confirmItemBox(actor.wrapstarId, itemId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, shift: result.shift, item: result.item });
  }
  if (body.action === "wrapped") {
    const result = await completeItemWrap(actor.wrapstarId, itemId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      ok: true,
      shift: result.shift,
      item: result.item,
      barcodeDataUrl: result.barcodeDataUrl,
    });
  }
  if (body.action === "label") {
    const result = await confirmItemLabel(actor.wrapstarId, itemId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, shift: result.shift, item: result.item });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
