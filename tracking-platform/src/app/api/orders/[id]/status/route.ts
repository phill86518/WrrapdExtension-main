import { NextRequest, NextResponse } from "next/server";
import { getSession, isContractorRole } from "@/lib/auth";
import { updateOrderStatus } from "@/lib/data";
import { loadOrderIfMutable } from "@/lib/order-access";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const allowed = await loadOrderIfMutable(session, id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden or not found" }, { status: 403 });
  }

  let status = "assigned";

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { status?: string };
    status = body.status || status;
  } else {
    const formData = await request.formData();
    status = String(formData.get("status") || status);
  }

  if (status === "delivered" && isContractorRole(session.role) && !allowed.proofPhotoUrl) {
    return NextResponse.json({ error: "Take the delivery photo first." }, { status: 400 });
  }

  const result = await updateOrderStatus(
    id,
    status as "scheduled" | "assigned" | "en_route" | "out_for_delivery" | "delivered" | "cancelled",
    session.userId,
  );
  if (!result) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json({ ok: true, order: result });
}
