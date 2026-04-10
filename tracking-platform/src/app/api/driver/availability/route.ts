import { NextRequest, NextResponse } from "next/server";
import { requireDriverSession } from "@/lib/auth";
import { submitWeekAvailability } from "@/lib/availability-store";
import type { DayShiftAvailability } from "@/lib/types";

export async function POST(request: NextRequest) {
  const session = await requireDriverSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as {
    weekStartMonday?: string;
    days?: Record<string, DayShiftAvailability>;
  };
  if (!body.weekStartMonday || !body.days || typeof body.days !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }
  await submitWeekAvailability(session.userId, body.weekStartMonday, body.days);
  return NextResponse.json({ ok: true });
}
