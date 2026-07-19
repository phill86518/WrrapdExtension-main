import { NextResponse } from "next/server";

/** @deprecated Batch handoff replaced by per-order Finished wrapping + End video. */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Batch handoff is retired. Use Finished wrapping + End video on each order.",
    },
    { status: 410 },
  );
}
