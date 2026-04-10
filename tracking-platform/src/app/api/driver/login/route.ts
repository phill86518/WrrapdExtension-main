import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, setSessionCookie, verifyDriverPassword } from "@/lib/auth";
import { findDriverByName, listRegisteredDrivers } from "@/lib/driver-registry";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "");
  const driverName = String(formData.get("driverName") || "Driver");
  if (!(await verifyDriverPassword(password))) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  const exact = await findDriverByName(driverName);
  const fallback = (await listRegisteredDrivers())[0];
  const selected = exact ?? fallback;
  if (!selected) {
    return NextResponse.json({ ok: false, error: "No drivers configured" }, { status: 503 });
  }

  const token = await createSessionToken({
    role: "driver",
    userId: selected.id,
    name: selected.name,
  });
  await setSessionCookie(token);
  return NextResponse.json({ ok: true });
}
