import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { messageMedia } from "@/lib/service-desk";
import { fetchTwilioMedia } from "@/lib/twilio-rest";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ phone: string; sid: string; index: string }> },
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { phone, sid, index } = await params;
  const media = await messageMedia(decodeURIComponent(phone), decodeURIComponent(sid), decodeURIComponent(index));
  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const file = await fetchTwilioMedia(media.url);
  if (!file) return NextResponse.json({ error: "Could not load attachment" }, { status: 502 });
  return new NextResponse(file.body, {
    status: 200,
    headers: {
      "Content-Type": file.contentType || media.contentType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
