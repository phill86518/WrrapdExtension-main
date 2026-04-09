import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveProofPhoto } from "@/lib/data";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.role !== "driver") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const contentType = request.headers.get("content-type") || "";
  let dataUrl = "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { dataUrl?: string };
    dataUrl = body.dataUrl || "";
  } else {
    const formData = await request.formData();
    const file = formData.get("proofPhoto");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File required" }, { status: 400 });
    }
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "image/jpeg";
    dataUrl = `data:${mimeType};base64,${base64}`;
  }

  if (!dataUrl) {
    return NextResponse.json({ error: "Photo payload required" }, { status: 400 });
  }

  const updatedOrder = await saveProofPhoto(id, dataUrl, session.userId);
  return NextResponse.json({ ok: true, order: updatedOrder });
}
