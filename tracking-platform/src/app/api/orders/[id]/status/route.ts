import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateOrderStatus } from "@/lib/data";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let status = "assigned";

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { status?: string };
    status = body.status || status;
  } else {
    const formData = await request.formData();
    status = String(formData.get("status") || status);
  }

  const result = await updateOrderStatus(
    id,
    status as "scheduled" | "assigned" | "en_route" | "delivered" | "cancelled",
    session.userId,
  );
  if (!result) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json({ ok: true, order: result });
}
