import { NextRequest, NextResponse } from "next/server";
import { updateCallStatus } from "@/lib/service-desk";
import { readTwilioForm, twilioRequestTrusted, twiml } from "@/lib/twilio-rest";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const params = await readTwilioForm(request);
  if (!twilioRequestTrusted(request, params)) {
    return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
  }
  const duration = Number(params.CallDuration || "");
  try {
    await updateCallStatus(
      params.CallSid || "",
      params.From || "",
      params.CallStatus || "",
      Number.isFinite(duration) ? duration : undefined,
    );
  } catch (err) {
    console.error("[twilio/voice/status] store failed", err);
  }
  return twiml("");
}
