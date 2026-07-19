import { NextResponse } from "next/server";

/** @deprecated Ad-hoc gifts replaced by assigned order sequence. */
export async function POST() {
  return NextResponse.json(
    { error: "Use Start Shift — jobs come from your assigned order list." },
    { status: 410 },
  );
}
