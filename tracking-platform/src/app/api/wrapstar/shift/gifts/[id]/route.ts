import { NextResponse } from "next/server";

/** @deprecated */
export async function PATCH() {
  return NextResponse.json(
    { error: "Gift APIs retired. Use per-order wrap endpoints." },
    { status: 410 },
  );
}
