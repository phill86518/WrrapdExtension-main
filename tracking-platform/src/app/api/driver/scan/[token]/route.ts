import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listAllOrders } from "@/lib/data";
import { buildDriverLabelPayload, verifyDriverLabelPayload } from "@/lib/driver-label-qr";
import { findDeliveryDriverById } from "@/lib/driver-registry";

/**
 * Designated Drivers + Admin only: resolve a wrap-label QR token to delivery details.
 * WrapStars cannot read these labels.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role === "wrapstar") {
    return NextResponse.json({ error: "Driver access only." }, { status: 403 });
  }
  if (session.role !== "admin") {
    const courier = await findDeliveryDriverById(session.userId);
    if (!courier) {
      // Legacy WrapStar sessions used role "driver" — deny unless courier registry match.
      return NextResponse.json({ error: "Driver access only." }, { status: 403 });
    }
  }

  const { token } = await params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const orders = await listAllOrders();
  const order = orders.find((o) => o.driverLabelToken === token);
  if (!order) {
    return NextResponse.json({ error: "Label not found" }, { status: 404 });
  }

  const payload = buildDriverLabelPayload(order);
  if (!verifyDriverLabelPayload(payload)) {
    return NextResponse.json({ error: "Invalid label signature" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    orderNumber: payload.orderNumber,
    pickupFlowers: payload.pickupFlowers,
    floristOrderNumber: payload.floristOrderNumber,
    giftee: payload.giftee,
    deliverBy: payload.deliverBy,
    specialInstructions: payload.specialInstructions,
  });
}
