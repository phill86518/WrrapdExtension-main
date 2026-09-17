import { NextResponse } from "next/server";
import { requireWrapActor } from "@/lib/auth";
import { getActiveShiftBundle } from "@/lib/shift-store";

export async function GET() {
  const actor = await requireWrapActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const bundle = await getActiveShiftBundle(actor.wrapstarId);
  return NextResponse.json({ ok: true, ...bundle });
}
