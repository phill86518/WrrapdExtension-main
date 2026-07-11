import { NextRequest, NextResponse } from "next/server";
import { applySessionCookieToResponse, createSessionToken, verifyWrapstarPassword } from "@/lib/auth";
import { findWrapstarByName, listRegisteredWrapstars } from "@/lib/wrapstar-registry";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "").trim();
  const wrapstarName = String(
    formData.get("wrapstarName") || formData.get("driverName") || "WrapStar",
  ).trim();
  if (!(await verifyWrapstarPassword(password))) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  const exact = await findWrapstarByName(wrapstarName);
  const fallback = (await listRegisteredWrapstars())[0];
  const selected = exact ?? fallback;
  if (!selected) {
    return NextResponse.json({ ok: false, error: "No WrapStars configured" }, { status: 503 });
  }

  const token = await createSessionToken({
    role: "wrapstar",
    userId: selected.id,
    name: selected.name,
  });
  const res = NextResponse.json({ ok: true });
  applySessionCookieToResponse(res, token);
  return res;
}
