import { NextRequest, NextResponse } from "next/server";
import { getSession, updateDriverPassword, verifyDriverPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "driver") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    currentPassword?: string;
    newPassword?: string;
  };
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");
  if (!(await verifyDriverPassword(currentPassword))) {
    return NextResponse.json({ ok: false, error: "Current password is incorrect" }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ ok: false, error: "New password must be at least 8 characters" }, { status: 400 });
  }

  await updateDriverPassword(newPassword);
  return NextResponse.json({ ok: true });
}
