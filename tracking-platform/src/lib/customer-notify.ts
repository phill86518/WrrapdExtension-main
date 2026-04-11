/** Resend (email) + Twilio (SMS). No-op when env is missing — logs once per channel. */

let warnedResend = false;
let warnedTwilio = false;

export function getPublicOrigin(): string {
  return process.env.TRACKING_PUBLIC_ORIGIN?.trim().replace(/\/$/, "") || "";
}

export function toUsE164(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

export async function sendTransactionalEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    if (!warnedResend) {
      console.warn("[notify] RESEND_API_KEY not set — transactional emails skipped");
      warnedResend = true;
    }
    return false;
  }
  const from =
    process.env.NOTIFY_EMAIL_FROM?.trim() || "Wrrapd <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("[notify] Resend error:", res.status, t);
    return false;
  }
  return true;
}

export async function sendTransactionalSms(opts: { toE164: string; body: string }): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_SMS_FROM?.trim();
  if (!sid || !token || !from) {
    if (!warnedTwilio) {
      console.warn(
        "[notify] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_SMS_FROM not set — SMS skipped",
      );
      warnedTwilio = true;
    }
    return false;
  }
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const body = new URLSearchParams({
    To: opts.toE164,
    From: from,
    Body: opts.body,
  });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("[notify] Twilio error:", res.status, t);
    return false;
  }
  return true;
}
