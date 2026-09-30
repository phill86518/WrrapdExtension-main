import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listServiceThreads, replyOnThread, serviceSummary } from "@/lib/service-desk";
import { readTwilioLine, twilioCreds } from "@/lib/twilio-rest";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const threads = await listServiceThreads();
    let line = null;
    if (twilioCreds()) {
      try {
        line = await readTwilioLine();
      } catch (err) {
        console.error("[admin/service] line lookup failed", err);
      }
    }
    return NextResponse.json({
      threads,
      summary: serviceSummary(threads),
      line,
      twilioConfigured: Boolean(twilioCreds()),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load customer service";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { phone?: string; body?: string };
  try {
    const thread = await replyOnThread({
      phoneRaw: body.phone || "",
      body: body.body || "",
      actor: session.name,
    });
    return NextResponse.json({ thread });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
