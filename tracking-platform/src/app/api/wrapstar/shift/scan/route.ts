import { NextResponse } from "next/server";
import { requireWrapActor } from "@/lib/auth";
import { openItemByScan } from "@/lib/shift-store";

export async function POST(request: Request) {
  const actor = await requireWrapActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { code?: string };
  const result = await openItemByScan(actor.wrapstarId, body.code || "");
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, shift: result.shift, item: result.item });
}
