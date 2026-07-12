import { NextResponse } from "next/server";

/** Plain Node handler — no RSC — so curl shows exactly what this Cloud Run revision runs. */
export const dynamic = "force-dynamic";

const DRIVER_UI_MARKER = "wrrapd-wrapstar-ui-2026-07-11-geo-pricing";

export async function GET() {
  return NextResponse.json({
    marker: DRIVER_UI_MARKER,
    kRevision: process.env.K_REVISION ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
    timeUtc: new Date().toISOString(),
  });
}
