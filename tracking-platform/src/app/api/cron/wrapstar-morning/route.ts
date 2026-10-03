import { NextResponse } from "next/server";
import { sendMorningWrapSheets } from "@/lib/wrapstar-morning-email";

/** Call just before 8am Eastern. Header: x-cron-secret matching CRON_SECRET. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const sent = request.headers.get("x-cron-secret") || "";
  if (!secret || sent !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await sendMorningWrapSheets();
  return NextResponse.json({ ok: true, ...result });
}
