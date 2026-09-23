import { NextRequest, NextResponse } from "next/server";
import { requireDeliveryActor, requireWrapActor } from "@/lib/auth";
import { submitWeekAvailability } from "@/lib/availability-store";
import type { DayShiftAvailability } from "@/lib/types";

/**
 * Accepts WrapStar / WrapRider (wrap capacity id) or JoyRider / WrapRider (courier id).
 * Records are keyed by that roster id in tracking_week_availability.
 */
export async function POST(request: NextRequest) {
  const wrap = await requireWrapActor();
  const delivery = wrap ? null : await requireDeliveryActor();
  const actorId = wrap?.wrapstarId || delivery?.courierDriverId;
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    weekStartMonday?: string;
    days?: Record<string, DayShiftAvailability>;
  };
  if (!body.weekStartMonday || !body.days || typeof body.days !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }
  await submitWeekAvailability(actorId, body.weekStartMonday, body.days);
  return NextResponse.json({ ok: true });
}
