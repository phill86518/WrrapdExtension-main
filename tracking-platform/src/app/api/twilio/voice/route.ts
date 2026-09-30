import { NextRequest, NextResponse } from "next/server";
import { logSystemSms, recordInbound } from "@/lib/service-desk";
import { resolvePublicOrigin } from "@/lib/public-origin";
import { readTwilioForm, sendTwilioSms, twilioRequestTrusted, twiml } from "@/lib/twilio-rest";

export const dynamic = "force-dynamic";

const CALL_TEXT = "Thanks for calling Wrrapd. Reply to this text and we'll help you right away.";

export async function POST(request: NextRequest) {
  const params = await readTwilioForm(request);
  if (!twilioRequestTrusted(request, params)) {
    return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
  }
  const callSid = params.CallSid || "";
  const from = params.From || "";
  try {
    const thread = await recordInbound({
      sid: callSid,
      fromRaw: from,
      channel: "voice",
      body: "Incoming call",
      callStatus: params.CallStatus || "ringing",
    });
    if (thread && !thread.optedOut) {
      const sent = await sendTwilioSms({ toE164: thread.phoneE164, body: CALL_TEXT });
      await logSystemSms(thread.phoneE164, CALL_TEXT, sent.sid);
    }
  } catch (err) {
    console.error("[twilio/voice] store failed", err);
  }
  const origin = resolvePublicOrigin((name) => request.headers.get(name), request.nextUrl.origin);
  const recordingCallback = origin
    ? `${origin.replace(/\/$/, "")}/api/twilio/voice/recording`
    : "/api/twilio/voice/recording";
  return twiml(
    `<Say voice="Polly.Joanna">Thank you for calling Wrrapd. Please leave a short message after the tone. We will text you back at this number.</Say><Record maxLength="120" playBeep="true" recordingStatusCallback="${recordingCallback}" recordingStatusCallbackMethod="POST"/>`,
  );
}
