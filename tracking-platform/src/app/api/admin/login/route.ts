import { NextRequest, NextResponse } from "next/server";
import { applySessionCookieToResponse, createSessionToken } from "@/lib/auth";
import { buildRedirectUrl, safeAdminNextPath } from "@/lib/url";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "").trim();
  const next = safeAdminNextPath(formData.get("next"));
  const expected = (process.env.APP_ADMIN_PASSWORD || "admin123").trim();
  if (password !== expected) {
    const err = next
      ? `/admin?error=1&next=${encodeURIComponent(next)}`
      : "/admin?error=1";
    return NextResponse.redirect(buildRedirectUrl(request, err));
  }
  const token = await createSessionToken({
    role: "admin",
    userId: "admin-1",
    name: "Admin",
  });
  const res = NextResponse.redirect(buildRedirectUrl(request, next || "/admin"));
  applySessionCookieToResponse(res, token);
  return res;
}
