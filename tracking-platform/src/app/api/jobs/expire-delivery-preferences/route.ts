import { NextRequest, NextResponse } from "next/server";
import { expireStaleDeliveryPreferences } from "@/lib/data";

/**
 * Call from Cloud Scheduler (or cron) nightly with header:
 *   x-cron-secret: <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const closed = await expireStaleDeliveryPreferences();
  return NextResponse.json({ ok: true, closed });
}
