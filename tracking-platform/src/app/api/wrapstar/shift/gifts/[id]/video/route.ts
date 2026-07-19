import { NextResponse } from "next/server";

/** @deprecated Use /api/wrapstar/shift/orders/[orderId]/live-chunk and end-video. */
export async function POST() {
  return NextResponse.json(
    { error: "Use order live-chunk / end-video endpoints." },
    { status: 410 },
  );
}
