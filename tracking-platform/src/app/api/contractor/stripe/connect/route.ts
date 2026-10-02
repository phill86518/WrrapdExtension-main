import { NextResponse } from "next/server";
import { getSession, isContractorRole } from "@/lib/auth";
import { createConnectOnboardingLink, stripeConfigured, trackingPublicOrigin } from "@/lib/stripe-connect";

function homePath(role: string): string {
  if (role === "driver") return "/courier";
  if (role === "wraprider") return "/wraprider";
  return "/wrapstar";
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !isContractorRole(session.role)) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Bank connection is not available yet." }, { status: 503 });
  }
  const origin = trackingPublicOrigin(request);
  const next = homePath(session.role);
  const role = session.role === "driver" ? "joyrider" : session.role;
  const url = await createConnectOnboardingLink({
    contractorId: session.userId,
    role,
    name: session.name,
    returnUrl: `${origin}/api/contractor/stripe/return?next=${encodeURIComponent(next)}`,
    refreshUrl: `${origin}/api/contractor/stripe/connect`,
  });
  return NextResponse.redirect(url);
}
