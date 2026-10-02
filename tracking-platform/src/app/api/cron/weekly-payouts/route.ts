import { NextResponse } from "next/server";
import { runWeeklyPayouts } from "@/lib/weekly-pay";

/** Thursday 6:00pm Eastern. Header: x-cron-secret matching CRON_SECRET. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const sent = request.headers.get("x-cron-secret") || "";
  if (!secret || sent !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await runWeeklyPayouts();
  return NextResponse.json({ ok: true, week: result.week, results: result.results });
}
