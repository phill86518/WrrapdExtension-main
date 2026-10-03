import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { readSupportAiSettings, supportAiConfigured, writeSupportAiSettings } from "@/lib/support-ai";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const settings = await readSupportAiSettings();
    return NextResponse.json({ ...settings, configured: supportAiConfigured() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load AI settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { enabled?: boolean };
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Choose on or off" }, { status: 400 });
  }
  try {
    const settings = await writeSupportAiSettings(body.enabled, session.name);
    return NextResponse.json({ ...settings, configured: supportAiConfigured() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save AI settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
