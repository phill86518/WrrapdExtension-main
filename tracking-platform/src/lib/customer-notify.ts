/** Email: SMTP (e.g. SiteGround) when SMTP_HOST+SMTP_USER+SMTP_PASS are set; else optional Mailgun. Twilio for SMS. */

import nodemailer from "nodemailer";

let warnedNoEmailTransport = false;
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

export function smtpEnvConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST?.trim() &&
    process.env.SMTP_USER?.trim() &&
    process.env.SMTP_PASS?.trim()
  );
}

function createNotifySmtpTransport() {
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const secure =
    process.env.SMTP_SECURE === "false"
      ? false
      : process.env.SMTP_SECURE === "true"
        ? true
        : port === 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASS!.trim(),
    },
  });
}

async function sendTransactionalEmailSmtp(opts: {
  to: string;
  subject: string;
  html: string;
  bcc?: string | string[];
}): Promise<boolean> {
  try {
    const transporter = createNotifySmtpTransport();
    const configuredFrom = process.env.NOTIFY_EMAIL_FROM?.trim();
    const smtpUser = process.env.SMTP_USER?.trim();
    const from = configuredFrom
      ? configuredFrom.includes("<")
        ? configuredFrom
        : `Wrrapd Orders <${configuredFrom}>`
      : smtpUser
        ? `Wrrapd Orders <${smtpUser}>`
        : "Wrrapd Orders <orders@wrrapd.com>";
    const replyTo = process.env.NOTIFY_EMAIL_REPLY_TO?.trim();
    const bcc =
      opts.bcc === undefined
        ? undefined
        : Array.isArray(opts.bcc)
          ? opts.bcc.map((s) => s.trim()).filter(Boolean).join(", ")
          : String(opts.bcc).trim() || undefined;
    await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      ...(bcc ? { bcc } : {}),
      replyTo: replyTo || undefined,
    });
    console.info("[notify] SMTP sent OK to", opts.to);
    return true;
  } catch (e) {
    console.error("[notify] SMTP error:", e);
    return false;
  }
}

/**
 * Send HTML email: prefers SMTP (SiteGround-style); if unset, uses Mailgun API when MAILGUN_API_KEY+MAILGUN_DOMAIN are set.
 * NOTIFY_EMAIL_FROM optional for both paths.
 */
export async function sendTransactionalEmail(opts: {
  to: string;
  subject: string;
  html: string;
  bcc?: string | string[];
}): Promise<boolean> {
  if (smtpEnvConfigured()) {
    return sendTransactionalEmailSmtp(opts);
  }
  if (process.env.FORCE_SMTP_ONLY === "true") {
    if (!warnedNoEmailTransport) {
      warnedNoEmailTransport = true;
      console.warn("[notify] FORCE_SMTP_ONLY=true but SMTP env missing; email skipped");
    }
    return false;
  }

  const key = process.env.MAILGUN_API_KEY?.trim();
  const domain = process.env.MAILGUN_DOMAIN?.trim();
  if (!key || !domain) {
    if (!warnedNoEmailTransport) {
      warnedNoEmailTransport = true;
      console.warn(
        "[notify] No email transport: set SMTP_HOST, SMTP_USER, SMTP_PASS or MAILGUN_API_KEY + MAILGUN_DOMAIN",
      );
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
  if (opts.bcc) {
    const bcc = Array.isArray(opts.bcc) ? opts.bcc.map((s) => s.trim()).filter(Boolean).join(", ") : opts.bcc.trim();
    if (bcc) params.set("bcc", bcc);
  }
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
