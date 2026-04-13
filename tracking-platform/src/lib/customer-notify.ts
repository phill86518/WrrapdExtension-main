/** Mailgun (email) + Twilio (SMS). Same provider family as pay.wrrapd.com — no Resend. */

let warnedMailgun = false;
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

function mailgunApiBase(): string {
  return process.env.MAILGUN_REGION?.trim().toLowerCase() === "eu"
    ? "https://api.eu.mailgun.net/v3"
    : "https://api.mailgun.net/v3";
}

/**
 * Send HTML email via Mailgun (same API as WrrapdServer process-payment).
 * Env: MAILGUN_API_KEY, MAILGUN_DOMAIN (required). NOTIFY_EMAIL_FROM optional.
 */
export async function sendTransactionalEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const key = process.env.MAILGUN_API_KEY?.trim();
  const domain = process.env.MAILGUN_DOMAIN?.trim();
  if (!key || !domain) {
    if (!warnedMailgun) {
      console.warn(
        "[notify] MAILGUN_API_KEY / MAILGUN_DOMAIN not set — transactional emails skipped",
      );
      warnedMailgun = true;
    }
    return false;
  }
  const from =
    process.env.NOTIFY_EMAIL_FROM?.trim() || "Wrrapd Orders <orders@wrrapd.com>";
  const replyTo = process.env.NOTIFY_EMAIL_REPLY_TO?.trim();
  const params = new URLSearchParams();
  params.set("from", from);
  params.set("to", opts.to);
  params.set("subject", opts.subject);
  params.set("html", opts.html);
  if (replyTo) {
    params.set("h:Reply-To", replyTo);
  }
  const url = `${mailgunApiBase()}/${encodeURIComponent(domain)}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${key}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("[notify] Mailgun error:", res.status, t);
    return false;
  }
  try {
    const j = (await res.json()) as { id?: string; message?: string };
    console.info("[notify] Mailgun queued", j.id ?? "ok", "to", opts.to);
  } catch {
    console.info("[notify] Mailgun sent OK to", opts.to);
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
