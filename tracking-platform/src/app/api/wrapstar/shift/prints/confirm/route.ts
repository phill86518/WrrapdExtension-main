import { NextResponse } from "next/server";
import { requireWrapActor } from "@/lib/auth";
import { confirmPrints } from "@/lib/shift-store";

export async function POST() {
  const actor = await requireWrapActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await confirmPrints(actor.wrapstarId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, shift: result.shift });
}
