import { NextRequest, NextResponse } from "next/server";
import { applySessionCookieToResponse, createSessionToken, verifyWrapstarPassword } from "@/lib/auth";
import { findWrapstarByEmail, findWrapstarById, findWrapstarByName } from "@/lib/wrapstar-registry";
import { looksLikeEmail, verifyPortalCredentials } from "@/lib/wp-portal-auth";
import { touchContractorLogin } from "@/lib/contractor-records";

/**
 * WrapStar App login (wrapstar.wrrapd.com).
 *
 * Primary: the WordPress onboarding email + password (one login everywhere). The account must be
 * an activated WrapStar ("Approve onboarding" in Command Center) and on the ops roster.
 * Fallback: legacy roster name / 10-digit ID + shared contractor passcode (founder + demo rows).
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "").trim();
  const identifier = String(
    formData.get("email") || formData.get("wrapstarName") || formData.get("driverName") || "",
  ).trim();

  if (!identifier) {
    return NextResponse.json(
      { ok: false, error: "Enter your email address." },
      { status: 400 },
    );
  }
  if (!password) {
    return NextResponse.json({ ok: false, error: "Enter your password." }, { status: 400 });
  }

  const issueSession = async (id: string, name: string) => {
    const token = await createSessionToken({ role: "wrapstar", userId: id, name });
    const res = NextResponse.json({ ok: true, wrapstarId: id });
    applySessionCookieToResponse(res, token);
    return res;
  };

  if (looksLikeEmail(identifier)) {
    const auth = await verifyPortalCredentials(identifier, password, "wrapstar");
    if (!auth.ok) {
      // Legacy email + shared passcode (founder/demo rows) still works; otherwise surface the error.
      if (await verifyWrapstarPassword(password)) {
        const roster = await findWrapstarByEmail(identifier);
        if (roster) return issueSession(roster.id, roster.name);
      }
      const generic = auth.status === 401 ? "Invalid email or password." : auth.error;
      return NextResponse.json(
        { ok: false, error: generic },
        { status: auth.status === 401 ? 401 : 503 },
      );
    }
    const role = auth.roles.wrapstar;
    if (!role) {
      return NextResponse.json(
        { ok: false, error: "This account is not a WrapStar. JoyRiders sign in at joyrider.wrrapd.com." },
        { status: 403 },
      );
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
          : "Your WrapStar account is not active yet.";
      return NextResponse.json({ ok: false, error: msg, status: role.status }, { status: 403 });
    }
    const roster = await findWrapstarByEmail(auth.email);
    if (!roster) {
      return NextResponse.json(
        {
          ok: false,
          error: "Your account is activated but not on the roster yet. Please contact Wrrapd support.",
        },
        { status: 409 },
      );
    }
    void touchContractorLogin("wrapstar", roster.id).catch(() => undefined);
    return issueSession(roster.id, roster.name);
  }

  // Legacy: roster name / ID + shared passcode.
  if (!(await verifyWrapstarPassword(password))) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }
  const selected = (await findWrapstarById(identifier)) || (await findWrapstarByName(identifier));
  if (!selected) {
    return NextResponse.json(
      { ok: false, error: "Unknown WrapStar — use your email address, or the exact roster name / 10-digit ID." },
      { status: 404 },
    );
  }
  return issueSession(selected.id, selected.name);
}
