import { NextRequest, NextResponse } from "next/server";
import {
  applySessionCookieToResponse,
  createSessionToken,
  verifyWrapstarPassword,
} from "@/lib/auth";
import {
  findDeliveryDriverByEmail,
  findDeliveryDriverById,
  listDeliveryDrivers,
} from "@/lib/driver-registry";
import { looksLikeEmail, verifyPortalCredentials } from "@/lib/wp-portal-auth";
import { touchContractorLogin } from "@/lib/contractor-records";

/**
 * JoyRider (courier) App login (joyrider.wrrapd.com) — separate from WrapStar.
 *
 * Primary: WordPress onboarding email + password. Account must be an activated JoyRider
 * ("Approve onboarding" in Command Center) and on the DeliveryDriver roster.
 * Fallback: roster name / email / 10-digit ID (7…) + shared contractor passcode.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "").trim();
  const identifier = String(
    formData.get("email") ||
      formData.get("driverName") ||
      formData.get("courierName") ||
      formData.get("name") ||
      "",
  ).trim();

  if (!identifier) {
    return NextResponse.json({ ok: false, error: "Enter your email address." }, { status: 400 });
  }
  if (!password) {
    return NextResponse.json({ ok: false, error: "Enter your password." }, { status: 400 });
  }

  const issueSession = async (id: string, name: string) => {
    const token = await createSessionToken({ role: "driver", userId: id, name });
    const res = NextResponse.json({ ok: true, driverId: id });
    applySessionCookieToResponse(res, token);
    return res;
  };

  if (looksLikeEmail(identifier)) {
    const auth = await verifyPortalCredentials(identifier, password, "driver");
    if (auth.ok) {
      const role = auth.roles.driver;
      if (!role) {
        return NextResponse.json(
          { ok: false, error: "This account is not a JoyRider. WrapStars sign in at wrapstar.wrrapd.com." },
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
            : "Your JoyRider account is not active yet.";
        return NextResponse.json({ ok: false, error: msg, status: role.status }, { status: 403 });
      }
      const roster = await findDeliveryDriverByEmail(auth.email);
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
        return NextResponse.json({ ok: false, error: "JoyRider not approved" }, { status: 403 });
      }
      void touchContractorLogin("driver", roster.id).catch(() => undefined);
      return issueSession(roster.id, roster.name);
    }
    // Wrong WP password → fall through only if the shared passcode matches (legacy email+passcode).
    if (auth.status === 401 && !(await verifyWrapstarPassword(password))) {
      return NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 401 });
    }
    if (auth.status !== 401 && !(await verifyWrapstarPassword(password))) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: 503 });
    }
  } else if (!(await verifyWrapstarPassword(password))) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  // Legacy roster lookup + shared passcode.
  const all = await listDeliveryDrivers();
  const needle = identifier.toLowerCase();
  const byId = await findDeliveryDriverById(identifier);
  const byEmail = identifier.includes("@") ? await findDeliveryDriverByEmail(identifier) : undefined;
  const byName = all.find((d) => d.name.trim().toLowerCase() === needle);
  const byDisplay = all.find(
    (d) => (d.displayId || "").trim().toLowerCase() === needle || d.id.toLowerCase() === needle,
  );
  const selected = byId || byEmail || byName || byDisplay;
  if (!selected) {
    return NextResponse.json(
      { ok: false, error: "Unknown JoyRider — use your email address, or the exact roster name / 10-digit ID." },
      { status: 404 },
    );
  }
  if (selected.status !== "approved") {
    return NextResponse.json({ ok: false, error: "JoyRider not approved" }, { status: 403 });
  }
  return issueSession(selected.id, selected.name);
}
