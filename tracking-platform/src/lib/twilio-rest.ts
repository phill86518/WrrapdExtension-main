import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export type TwilioCreds = { sid: string; token: string; from: string };

export function twilioCreds(): TwilioCreds | null {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_SMS_FROM?.trim();
  if (!sid || !token || !from) return null;
  return { sid, token, from };
}

export async function readTwilioForm(request: NextRequest): Promise<Record<string, string>> {
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value;
  }
  return params;
}

/** Full URLs Twilio may have signed (Cloud Run rewrites Host). */
export function twilioSignatureCandidates(request: NextRequest): string[] {
  const path = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const urls = new Set<string>();
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = request.headers.get("host")?.split(",")[0]?.trim();
  if (forwarded) urls.add(`${proto}://${forwarded}${path}`);
  if (host) urls.add(`${proto}://${host}${path}`);
  const env = process.env.TRACKING_PUBLIC_ORIGIN?.trim().replace(/\/$/, "");
  if (env) urls.add(`${env}${path}`);
  if (request.url) urls.add(request.url);
  return [...urls];
}

export function twilioSignatureMatches(
  authToken: string,
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;
  const payload =
    url +
    Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], "");
  const expected = createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function twilioRequestTrusted(request: NextRequest, params: Record<string, string>): boolean {
  const creds = twilioCreds();
  if (!creds) return false;
  if (process.env.TWILIO_SKIP_SIGNATURE === "true" && process.env.NODE_ENV !== "production") {
    return true;
  }
  const signature = request.headers.get("x-twilio-signature");
  return twilioSignatureCandidates(request).some((url) =>
    twilioSignatureMatches(creds.token, signature, url, params),
  );
}

function authHeader(creds: TwilioCreds): string {
  return `Basic ${Buffer.from(`${creds.sid}:${creds.token}`).toString("base64")}`;
}

async function twilioFetch(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const creds = twilioCreds();
  if (!creds) throw new Error("Twilio is not configured");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.sid}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(creds),
      ...(init?.headers || {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof json.message === "string" ? json.message : `Twilio HTTP ${res.status}`;
    throw new Error(message);
  }
  return json;
}

export async function sendTwilioSms(opts: {
  toE164: string;
  body: string;
}): Promise<{ sid: string }> {
  const creds = twilioCreds();
  if (!creds) throw new Error("Twilio is not configured");
  const json = await twilioFetch("/Messages.json", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      To: opts.toE164,
      From: creds.from,
      Body: opts.body.slice(0, 1500),
    }),
  });
  const sid = typeof json.sid === "string" ? json.sid : "";
  if (!sid) throw new Error("Twilio did not return a message id");
  return { sid };
}

export type TwilioLineConfig = {
  phoneNumber: string;
  smsUrl: string;
  voiceUrl: string;
  connected: boolean;
};

let lineCache: { at: number; value: TwilioLineConfig | null } | null = null;

export async function readTwilioLine(): Promise<TwilioLineConfig | null> {
  if (lineCache && Date.now() - lineCache.at < 60_000) return lineCache.value;
  const creds = twilioCreds();
  if (!creds) return null;
  const json = await twilioFetch(
    `/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(creds.from)}`,
    { method: "GET" },
  );
  const rows = Array.isArray(json.incoming_phone_numbers)
    ? (json.incoming_phone_numbers as Record<string, unknown>[])
    : [];
  const row = rows[0];
  if (!row) {
    lineCache = { at: Date.now(), value: null };
    return null;
  }
  const smsUrl = typeof row.sms_url === "string" ? row.sms_url : "";
  const voiceUrl = typeof row.voice_url === "string" ? row.voice_url : "";
  const value = {
    phoneNumber: typeof row.phone_number === "string" ? row.phone_number : creds.from,
    smsUrl,
    voiceUrl,
    connected: smsUrl.includes("/api/twilio/sms") && voiceUrl.includes("/api/twilio/voice"),
  };
  lineCache = { at: Date.now(), value };
  return value;
}

export async function connectTwilioLine(origin: string): Promise<TwilioLineConfig> {
  const creds = twilioCreds();
  if (!creds) throw new Error("Twilio is not configured");
  const base = origin.replace(/\/$/, "");
  const json = await twilioFetch(
    `/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(creds.from)}`,
    { method: "GET" },
  );
  const rows = Array.isArray(json.incoming_phone_numbers)
    ? (json.incoming_phone_numbers as Record<string, unknown>[])
    : [];
  const phoneSid = typeof rows[0]?.sid === "string" ? rows[0].sid : "";
  if (!phoneSid) throw new Error("Wrrapd number was not found on this Twilio account");
  const smsUrl = `${base}/api/twilio/sms`;
  const voiceUrl = `${base}/api/twilio/voice`;
  const statusUrl = `${base}/api/twilio/voice/status`;
  lineCache = null;
  await twilioFetch(`/IncomingPhoneNumbers/${phoneSid}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      SmsUrl: smsUrl,
      SmsMethod: "POST",
      VoiceUrl: voiceUrl,
      VoiceMethod: "POST",
      StatusCallback: statusUrl,
      StatusCallbackMethod: "POST",
    }),
  });
  const connected = {
    phoneNumber: creds.from,
    smsUrl,
    voiceUrl,
    connected: true,
  };
  lineCache = { at: Date.now(), value: connected };
  return connected;
}

export async function fetchTwilioMedia(url: string): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const creds = twilioCreds();
  if (!creds) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  if (host !== "api.twilio.com" && !host.endsWith(".twilio.com")) return null;
  const res = await fetch(url, { headers: { Authorization: authHeader(creds) } });
  if (!res.ok) return null;
  return {
    body: await res.arrayBuffer(),
    contentType: res.headers.get("content-type") || "application/octet-stream",
  };
}

export function twiml(inner: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
  return new Response(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
