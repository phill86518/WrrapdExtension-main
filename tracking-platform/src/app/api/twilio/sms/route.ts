import { NextRequest, NextResponse } from "next/server";
import { recordInbound } from "@/lib/service-desk";
import { readTwilioForm, twilioRequestTrusted, twiml } from "@/lib/twilio-rest";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const params = await readTwilioForm(request);
  if (!twilioRequestTrusted(request, params)) {
    return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
  }
  const numMedia = Number(params.NumMedia || "0");
  const media = [];
  for (let i = 0; i < numMedia; i += 1) {
    const url = params[`MediaUrl${i}`];
    if (!url) continue;
    media.push({
      url,
      contentType: params[`MediaContentType${i}`] || "application/octet-stream",
    });
  }
  try {
    await recordInbound({
      sid: params.MessageSid || "",
      fromRaw: params.From || "",
      channel: media.length > 0 ? "mms" : "sms",
      body: params.Body || "",
      media,
    });
  } catch (err) {
    console.error("[twilio/sms] store failed", err);
    return NextResponse.json({ error: "Could not store message" }, { status: 500 });
  }
  return twiml("");
}
