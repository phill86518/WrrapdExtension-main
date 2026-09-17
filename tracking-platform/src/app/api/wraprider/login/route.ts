import { NextRequest, NextResponse } from "next/server";
import { applySessionCookieToResponse, createSessionToken } from "@/lib/auth";
import { findWrapriderByEmail } from "@/lib/wraprider-registry";
import { looksLikeEmail, verifyPortalCredentials } from "@/lib/wp-portal-auth";
import { touchContractorLogin } from "@/lib/contractor-records";

/**
 * WrapRider App login (wraprider.wrrapd.com) — the THIRD contractor login, separate from the
 * WrapStar and JoyRider apps.
 *
 * WordPress is the only authority: the email + password issued at approval on
 * apply.wrrapd.com/wraprider/ must belong to an activated WrapRider application
 * (`roles.wraprider`, status active) and the person must be on the WrapRiders roster (id 6…).
 * WrapStar / JoyRider accounts are refused here; WrapRider accounts are refused on the other two apps.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "").trim();
  const identifier = String(formData.get("email") || "").trim();

  if (!identifier) {
    return NextResponse.json({ ok: false, error: "Enter your email address." }, { status: 400 });
  }
  if (!password) {
    return NextResponse.json({ ok: false, error: "Enter your password." }, { status: 400 });
  }
  if (!looksLikeEmail(identifier)) {
    return NextResponse.json(
      { ok: false, error: "Sign in with the email address from your WrapRider onboarding." },
      { status: 400 },
    );
  }

  const auth = await verifyPortalCredentials(identifier, password, "wraprider");
  if (!auth.ok) {
    const generic = auth.status === 401 ? "Invalid email or password." : auth.error;
    return NextResponse.json(
      { ok: false, error: generic },
      { status: auth.status === 401 ? 401 : 503 },
    );
  }
  const role = auth.roles.wraprider;
  if (!role) {
    const hint = auth.roles.wrapstar
      ? "This account is a WrapStar. Sign in at wrapstar.wrrapd.com."
      : auth.roles.driver
        ? "This account is a JoyRider. Sign in at joyrider.wrrapd.com."
        : "This account is not a WrapRider.";
    return NextResponse.json({ ok: false, error: hint }, { status: 403 });
  }
  if (role.suspended) {
    return NextResponse.json(
      { ok: false, error: "Your account is paused. Please contact Wrrapd support." },
      { status: 403 },
    );
  }
  if (role.status !== "active") {
    const msg =
      role.status === "approved"
        ? "Almost there — finish onboarding first. We'll email you when your account is activated."
        : "Your WrapRider account is not active yet.";
    return NextResponse.json({ ok: false, error: msg, status: role.status }, { status: 403 });
  }

  const roster = await findWrapriderByEmail(auth.email);
  if (!roster) {
    return NextResponse.json(
      {
        ok: false,
        error: "Your account is activated but not on the roster yet. Please contact Wrrapd support.",
      },
      { status: 409 },
    );
  }
  if (roster.status !== "approved") {
    return NextResponse.json({ ok: false, error: "Your WrapRider account is not active yet." }, { status: 403 });
  }

  void touchContractorLogin("wraprider", roster.id).catch(() => undefined);
  const token = await createSessionToken({ role: "wraprider", userId: roster.id, name: roster.name });
  const res = NextResponse.json({ ok: true, wrapriderId: roster.id });
  applySessionCookieToResponse(res, token);
  return res;
}
