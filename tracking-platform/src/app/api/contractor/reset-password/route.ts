import { NextRequest, NextResponse } from "next/server";
import { completePortalPasswordReset, type PortalTrack } from "@/lib/wp-portal-auth";

const TRACKS: PortalTrack[] = ["wrapstar", "driver", "wraprider"];

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    login?: string;
    key?: string;
    newPassword?: string;
    portal?: string;
  };
  const portal = String(body.portal || "") as PortalTrack;
  if (!TRACKS.includes(portal) || !String(body.login || "").trim() || !String(body.key || "").trim()) {
    return NextResponse.json(
      { ok: false, error: "This reset link is not valid. Ask for a new one." },
      { status: 400 },
    );
  }
  const result = await completePortalPasswordReset({
    login: String(body.login),
    key: String(body.key),
    newPassword: String(body.newPassword || ""),
    portal,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
