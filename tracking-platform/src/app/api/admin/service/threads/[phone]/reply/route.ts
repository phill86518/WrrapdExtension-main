import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { replyOnThread } from "@/lib/service-desk";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { phone } = await params;
  const body = (await request.json().catch(() => ({}))) as { body?: string };
  try {
    const thread = await replyOnThread({
      phoneRaw: decodeURIComponent(phone),
      body: body.body || "",
      actor: session.name,
    });
    return NextResponse.json({ thread });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
