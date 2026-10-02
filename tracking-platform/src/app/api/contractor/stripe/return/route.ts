import { NextResponse } from "next/server";
import { getSession, isContractorRole } from "@/lib/auth";
import { refreshStripeConnectAccount, trackingPublicOrigin } from "@/lib/stripe-connect";

export async function GET(request: Request) {
  const session = await getSession();
  const url = new URL(request.url);
  const next = url.searchParams.get("next") || "/wrapstar";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/wrapstar";
  if (session && isContractorRole(session.role)) {
    await refreshStripeConnectAccount(session.userId).catch(() => null);
  }
  const origin = trackingPublicOrigin(request);
  return NextResponse.redirect(`${origin}${safeNext}?bank=connected`);
}
