import { NextResponse } from "next/server";
import { requireWrapstarSession } from "@/lib/auth";
import { getActiveShiftBundle } from "@/lib/shift-store";

export async function GET() {
  const session = await requireWrapstarSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const bundle = await getActiveShiftBundle(session.userId);
  return NextResponse.json({ ok: true, ...bundle });
}
