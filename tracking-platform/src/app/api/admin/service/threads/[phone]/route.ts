import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getServiceThread,
  setThreadAiPaused,
  setThreadStatus,
  type ServiceThreadStatus,
} from "@/lib/service-desk";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { phone } = await params;
  try {
    const detail = await getServiceThread(decodeURIComponent(phone));
    if (!detail) return NextResponse.json({ error: "No conversation yet" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load conversation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { phone } = await params;
  const body = (await request.json().catch(() => ({}))) as { status?: ServiceThreadStatus; aiPaused?: boolean };
  if (typeof body.aiPaused === "boolean") {
    try {
      const thread = await setThreadAiPaused(decodeURIComponent(phone), body.aiPaused);
      if (!thread) return NextResponse.json({ error: "No conversation yet" }, { status: 404 });
      return NextResponse.json({ thread });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
  if (body.status !== "open" && body.status !== "waiting" && body.status !== "resolved") {
    return NextResponse.json({ error: "Choose open, waiting, or resolved" }, { status: 400 });
  }
  try {
    const thread = await setThreadStatus(decodeURIComponent(phone), body.status);
    if (!thread) return NextResponse.json({ error: "No conversation yet" }, { status: 404 });
    return NextResponse.json({ thread });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
