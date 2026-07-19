import { NextRequest, NextResponse } from "next/server";
import { applySessionCookieToResponse, createSessionToken, verifyWrapstarPassword } from "@/lib/auth";
import { findWrapstarById, findWrapstarByName } from "@/lib/wrapstar-registry";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "").trim();
  const wrapstarName = String(
    formData.get("wrapstarName") || formData.get("driverName") || "",
  ).trim();
  if (!(await verifyWrapstarPassword(password))) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  if (!wrapstarName) {
    return NextResponse.json(
      { ok: false, error: "Enter your WrapStar name or 10-digit ID (starts with 8)" },
      { status: 400 },
    );
  }
  const selected =
    (await findWrapstarById(wrapstarName)) || (await findWrapstarByName(wrapstarName));
  if (!selected) {
    return NextResponse.json(
      { ok: false, error: "Unknown WrapStar — use the exact name or 10-digit ID" },
      { status: 404 },
    );
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
