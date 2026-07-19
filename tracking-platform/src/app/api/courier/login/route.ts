import { NextRequest, NextResponse } from "next/server";
import {
  applySessionCookieToResponse,
  createSessionToken,
  verifyWrapstarPassword,
} from "@/lib/auth";
import { findDeliveryDriverById, listDeliveryDrivers } from "@/lib/driver-registry";

/**
 * Courier Driver login — separate from WrapStar.
 * Accepts Driver name or 10-digit employee id (7…).
 * Uses the same shared contractor passcode as WrapStars for now.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "").trim();
  const nameOrId = String(
    formData.get("driverName") || formData.get("courierName") || formData.get("name") || "",
  ).trim();
  if (!(await verifyWrapstarPassword(password))) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  if (!nameOrId) {
    return NextResponse.json(
      { ok: false, error: "Enter your Driver name or 10-digit ID (starts with 7)" },
      { status: 400 },
    );
  }
  const all = await listDeliveryDrivers();
  const needle = nameOrId.toLowerCase();
  const byId = await findDeliveryDriverById(nameOrId);
  const byName = all.find((d) => d.name.trim().toLowerCase() === needle);
  const byDisplay = all.find(
    (d) => (d.displayId || "").trim().toLowerCase() === needle || d.id.toLowerCase() === needle,
  );
  const selected = byId || byName || byDisplay;
  if (!selected) {
    return NextResponse.json(
      { ok: false, error: "Unknown Driver — use the exact name or 10-digit ID" },
      { status: 404 },
    );
  }
  if (selected.status !== "approved") {
    return NextResponse.json({ ok: false, error: "Driver not approved" }, { status: 403 });
  }

  const token = await createSessionToken({
    role: "driver",
    userId: selected.id,
    name: selected.name,
  });
  const res = NextResponse.json({ ok: true, driverId: selected.id });
  applySessionCookieToResponse(res, token);
  return res;
}
