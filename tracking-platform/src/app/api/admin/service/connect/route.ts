import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { resolvePublicOrigin } from "@/lib/public-origin";
import { connectTwilioLine } from "@/lib/twilio-rest";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const origin = resolvePublicOrigin((name) => request.headers.get(name), request.nextUrl.origin);
  if (!origin) {
    return NextResponse.json({ error: "Could not determine the public site address" }, { status: 400 });
  }
  try {
    const line = await connectTwilioLine(origin);
    return NextResponse.json({ line });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not connect the number";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
