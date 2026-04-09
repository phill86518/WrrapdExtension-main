import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateDriverLocation } from "@/lib/data";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.role !== "driver") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json()) as {
    lat?: number;
    lng?: number;
    etaMinutes?: number;
  };

  if (typeof body.lat !== "number" || typeof body.lng !== "number") {
    return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  }

  const next = await updateDriverLocation(id, body.lat, body.lng, body.etaMinutes, session.userId);
  if (!next) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json({ ok: true, order: next });
}
