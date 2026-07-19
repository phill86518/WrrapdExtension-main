import { NextResponse } from "next/server";
import { requireWrapstarSession } from "@/lib/auth";
import { startShift } from "@/lib/shift-store";

export async function POST() {
  const session = await requireWrapstarSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await startShift(session.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, shift: result.shift, orders: result.orders });
}
