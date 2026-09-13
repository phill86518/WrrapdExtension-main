import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getContractorRecord } from "@/lib/contractor-records";
import { changePortalPassword } from "@/lib/wp-portal-account";

/**
 * Active WrapStar / JoyRider changes their sign-in password from inside the portal app.
 * The password lives in WordPress (same one issued at onboarding).
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "wrapstar" && session.role !== "driver")) {
    return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");
  const confirmPassword = String(body.confirmPassword ?? newPassword);
  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { ok: false, error: "Enter your current and new password." },
      { status: 400 },
    );
  }
  if (newPassword.length < 10) {
    return NextResponse.json(
      { ok: false, error: "Choose a new password with at least 10 characters." },
      { status: 400 },
    );
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json(
      { ok: false, error: "New password and confirmation do not match." },
      { status: 400 },
    );
  }

  const record = await getContractorRecord(session.role, session.userId).catch(() => null);
  if (!record?.email) {
    return NextResponse.json(
      { ok: false, error: "Your account record is not ready yet. Please contact Wrrapd support." },
      { status: 409 },
    );
  }

  const result = await changePortalPassword(
    record.email,
    session.role,
    currentPassword,
    newPassword,
  );
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status === 401 || result.status === 400 ? result.status : 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
