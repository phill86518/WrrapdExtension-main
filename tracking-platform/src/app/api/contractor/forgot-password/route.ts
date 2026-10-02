import { NextRequest, NextResponse } from "next/server";
import { looksLikeEmail, requestPortalPasswordReset, type PortalTrack } from "@/lib/wp-portal-auth";

const TRACKS: PortalTrack[] = ["wrapstar", "driver", "wraprider"];

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; portal?: string };
  const email = String(body.email || "").trim();
  const portal = String(body.portal || "") as PortalTrack;
  if (!looksLikeEmail(email) || !TRACKS.includes(portal)) {
    return NextResponse.json({ ok: false, error: "Enter the email on your account." }, { status: 400 });
  }
  const result = await requestPortalPasswordReset(email, portal);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 503 });
  }
  return NextResponse.json({
    ok: true,
    message: "Check your email for a link to choose a new password.",
  });
}
