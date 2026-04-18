import { NextRequest, NextResponse } from "next/server";
import { applySessionCookieToResponse, createSessionToken } from "@/lib/auth";
import { buildRedirectUrl } from "@/lib/url";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "").trim();
  const expected = (process.env.APP_ADMIN_PASSWORD || "admin123").trim();
  if (password !== expected) {
    return NextResponse.redirect(buildRedirectUrl(request, "/admin?error=1"));
  }
  const token = await createSessionToken({
    role: "admin",
    userId: "admin-1",
    name: "Admin",
  });
  const res = NextResponse.redirect(buildRedirectUrl(request, "/admin"));
  applySessionCookieToResponse(res, token);
  return res;
}
