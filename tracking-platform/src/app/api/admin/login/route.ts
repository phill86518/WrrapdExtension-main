import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { applySessionCookieToResponse, createSessionToken } from "@/lib/auth";
import { adminAccountsEnrolled, checkAdminLogin, normEmail } from "@/lib/admin-accounts";
import { buildRedirectUrl, safeAdminNextPath } from "@/lib/url";

function sharedPasswordMatches(password: string): boolean {
  const expected = (process.env.APP_ADMIN_PASSWORD || "").trim();
  if (!expected) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const code = String(formData.get("code") || "").trim();
  const next = safeAdminNextPath(formData.get("next"));
  const fail = (error: string) => {
    const err = next ? `/admin?error=${error}&next=${encodeURIComponent(next)}` : `/admin?error=${error}`;
    return NextResponse.redirect(buildRedirectUrl(request, err));
  };

  let session: { role: "admin"; userId: string; name: string };
  if (await adminAccountsEnrolled()) {
    const result = await checkAdminLogin(email, password, code);
    if (!result.ok) {
      console.warn("[admin-login] failed", { email: normEmail(email), reason: result.error });
      return fail(result.error === "locked" ? "locked" : "1");
    }
    session = { role: "admin", userId: `admin:${normEmail(result.user.email)}`, name: result.user.name || "Admin" };
  } else {
    if (!sharedPasswordMatches(password)) return fail("1");
    session = { role: "admin", userId: "admin-1", name: "Admin" };
  }

  const token = await createSessionToken(session);
  const res = NextResponse.redirect(buildRedirectUrl(request, next || "/admin"));
  applySessionCookieToResponse(res, token);
  return res;
}
