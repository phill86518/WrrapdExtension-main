import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, setSessionCookie, verifyDriverPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "");
  const driverName = String(formData.get("driverName") || "Driver");
  if (!(await verifyDriverPassword(password))) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  const n = driverName.toLowerCase();
  const driverId = n.includes("taylor") ? "drv-2" : "drv-1";
  const normalizedName = driverId === "drv-1" ? "Roger" : "Taylor";
  const token = await createSessionToken({
    role: "driver",
    userId: driverId,
    name: normalizedName,
  });
  await setSessionCookie(token);
  return NextResponse.json({ ok: true });
}
