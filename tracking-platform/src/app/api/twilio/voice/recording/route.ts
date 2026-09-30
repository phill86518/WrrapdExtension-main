import { NextRequest, NextResponse } from "next/server";
import { attachRecording } from "@/lib/service-desk";
import { readTwilioForm, twilioRequestTrusted, twiml } from "@/lib/twilio-rest";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const params = await readTwilioForm(request);
  if (!twilioRequestTrusted(request, params)) {
    return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
  }
  try {
    await attachRecording(params.CallSid || "", params.From || "", params.RecordingUrl || "");
  } catch (err) {
    console.error("[twilio/voice/recording] store failed", err);
    return NextResponse.json({ error: "Could not store recording" }, { status: 500 });
  }
  return twiml("");
}
