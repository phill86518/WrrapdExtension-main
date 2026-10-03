import { formatInTimeZone } from "date-fns-tz";
import { getPublicOrigin, sendTransactionalEmail } from "@/lib/customer-notify";
import { getFirestoreDb } from "@/lib/firebase-admin";
import { toInstantDate } from "@/lib/ny-date";
import {
  AI_ACTOR,
  findOrdersByPhone,
  formatUsPhone,
  logAutomaticSms,
  patchThread,
  phonesMatch,
  readThreadDoc,
  recentThreadMessages,
  type ServiceThread,
} from "@/lib/service-desk";
import { APPLICANT_FACTS, CONTRACTOR_FACTS, SHOPPER_FACTS } from "@/lib/support-ai-knowledge";
import { TRACKING_COLLECTIONS } from "@/lib/tracking-firestore";
import { sendTwilioSms } from "@/lib/twilio-rest";
import type { Order, OrderStatus } from "@/lib/types";

const NY = "America/New_York";
const MODEL = process.env.XAI_GROK_MODEL || "grok-4.5";
const BASE_URL = (process.env.XAI_API_BASE_URL || "https://api.x.ai/v1").replace(/\/$/, "");
/** Twilio waits 15 s for the webhook; a slower answer falls back to the holding text. */
const MODEL_TIMEOUT_MS = 12000;
const MAX_AI_REPLIES_PER_HOUR = 4;
const HOLDING_EVERY_MS = 2 * 60 * 60 * 1000;
const MIN_CONFIDENCE = 0.7;
const MAX_REPLY_CHARS = 480;

export const HOLDING_TEXT = "Thanks for your message! A Wrrapd team member will text you back shortly.";

/** Question types the AI may answer on its own. Everything else goes to a person. */
const SAFE_INTENTS = new Set([
  "greeting_or_thanks",
  "order_status",
  "how_it_works",
  "pricing_question",
  "delivery_info",
  "wrap_options",
  "flowers",
  "extension_help",
  "contractor_howto",
  "application_general",
]);

const INTENT_LABEL: Record<string, string> = {
  refund_or_cancel: "Refund or cancel request",
  complaint: "Complaint",
  damaged_or_missing: "Damaged, missing, or late gift",
  change_request: "Change to an order",
  pay_question: "Contractor pay question",
  schedule_change: "Schedule change",
  delivery_problem: "Problem on a delivery",
  order_lookup_unverified: "Order question from an unknown number",
  other: "Needs a person",
};

const STATUS_TEXT: Record<OrderStatus, string> = {
  pending: "received; waiting for the package to reach the Wrrapd hub",
  scheduled: "scheduled for wrapping and delivery",
  assigned: "assigned to a Wrrapd pro",
  accepted: "assigned to a Wrrapd pro",
  in_progress: "being gift-wrapped",
  en_route: "out for delivery",
  out_for_delivery: "out for delivery",
  delivered: "delivered",
  cancelled: "cancelled",
  refunded: "refunded",
};

export type SupportAiSettings = { enabled: boolean; updatedAt?: string; updatedBy?: string };

function settingsRef() {
  const db = getFirestoreDb();
  return db ? db.collection(TRACKING_COLLECTIONS.runtime).doc("support_ai") : null;
}

export function supportAiConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY?.trim());
}

export async function readSupportAiSettings(): Promise<SupportAiSettings> {
  const ref = settingsRef();
  if (!ref) return { enabled: false };
  const snap = await ref.get();
  const raw = (snap.data() || {}) as Record<string, unknown>;
  return {
    enabled: raw.enabled !== false,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    updatedBy: typeof raw.updatedBy === "string" ? raw.updatedBy : undefined,
  };
}

export async function writeSupportAiSettings(enabled: boolean, by: string): Promise<SupportAiSettings> {
  const ref = settingsRef();
  if (!ref) throw new Error("Storage is not configured");
  const next = { enabled, updatedAt: new Date().toISOString(), updatedBy: by };
  await ref.set(next, { merge: true });
  return next;
}

function orderLines(orders: Order[]): string {
  const origin = getPublicOrigin();
  const recent = [...orders].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).slice(0, 3);
  if (recent.length === 0) return "No Wrrapd orders are linked to this phone number.";
  return recent
    .map((o) => {
      let day = "";
      try {
        day = formatInTimeZone(toInstantDate(o.scheduledFor), NY, "EEEE, MMMM d");
      } catch {
        day = "";
      }
      const items = (o.lineItems || []).map((li) => li.title).filter(Boolean).slice(0, 3).join("; ");
      return [
        `- Order ${o.externalOrderId || o.id}: ${STATUS_TEXT[o.status] || o.status}.`,
        day && o.status !== "delivered" ? `  Wrrapd delivery day: ${day}.` : "",
        o.recipientName ? `  Recipient: ${o.recipientName}${o.city ? ` in ${o.city}` : ""}.` : "",
        items ? `  Gifts: ${items}.` : "",
        o.status === "delivered" && o.proofPhotoUrl ? "  Photo proof of delivery is on the tracking page." : "",
        origin && o.trackingToken ? `  Tracking link: ${origin}/track/${o.trackingToken}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

async function contextFor(thread: ServiceThread): Promise<SupportContext> {
  const a = thread.audience;
  if (a === "customer") {
    const orders = await findOrdersByPhone(thread.phoneE164).catch(() => []);
    return {
      who: `a Wrrapd shopper named ${thread.displayName}. This phone number is the shopper's own number on the orders below.`,
      facts: SHOPPER_FACTS,
      records: orderLines(orders),
    };
  }
  if (a === "wrapstar" || a === "joyrider" || a === "wraprider") {
    return {
      who: `${thread.displayName}, an active ${thread.audienceLabel} (Wrrapd contractor).`,
      facts: CONTRACTOR_FACTS,
      records: "Job and pay records are not shared by text.",
    };
  }
  if (a.endsWith("_applicant")) {
    return {
      who: `${thread.displayName}, a ${thread.audienceLabel}.`,
      facts: `${APPLICANT_FACTS}\n\n${SHOPPER_FACTS}`,
      records: "Application decisions are not shared by text.",
    };
  }
  return {
    who: "someone whose phone number is not linked to any Wrrapd order or contractor. They may be a gift recipient, so never discuss any order or gift.",
    facts: SHOPPER_FACTS,
    records: "None. Do not confirm or discuss any order.",
  };
}

const SYSTEM_PROMPT = `You are the Wrrapd text-message assistant. Wrrapd gift-wraps online purchases and delivers them.
Reply as "Wrrapd" in a warm, short, plain text message (1-3 sentences, under 320 characters, no emojis, no markdown).
Use ONLY the facts and records given. If something is not covered, do not guess: classify it as needing a person.
Rules you must never break:
- Never reveal or hint at gift contents, sender, or price to anyone except the shopper on the order.
- Never promise refunds, credits, discounts, cancellations, address changes, or exact delivery times.
- Never state any price or pay amount.
- Never mention internal systems, AI, staff names, or how routing works.
Return JSON only: {"intent": one of [greeting_or_thanks, order_status, how_it_works, pricing_question, delivery_info, wrap_options, flowers, extension_help, contractor_howto, application_general, refund_or_cancel, complaint, damaged_or_missing, change_request, pay_question, schedule_change, delivery_problem, order_lookup_unverified, other], "confidence": 0..1, "reply": "the text to send"}.
Use order_lookup_unverified when an unknown number asks about an order or gift.
Use delivery_problem when a contractor reports any issue on a job (nobody home, wrong address, damage, safety).
Use pricing_question when a shopper asks what Wrrapd costs; pay_question is only for contractor or applicant pay.`;

type ModelResult = { intent: string; confidence: number; reply: string };

async function askModel(system: string, user: string): Promise<ModelResult> {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) throw new Error("XAI_API_KEY is not configured");
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  });
  const raw = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(raw.error?.message || `xAI HTTP ${res.status}`);
  let text = String(raw.choices?.[0]?.message?.content || "").trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const parsed = JSON.parse(text) as Partial<ModelResult>;
  return {
    intent: typeof parsed.intent === "string" ? parsed.intent : "other",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    reply: typeof parsed.reply === "string" ? parsed.reply.trim() : "",
  };
}

/** Code-side guardrails; returns a reason when the draft must go to a person. */
function blockReason(result: ModelResult): string | null {
  if (!SAFE_INTENTS.has(result.intent)) return INTENT_LABEL[result.intent] || INTENT_LABEL.other;
  if (result.confidence < MIN_CONFIDENCE) return "AI was not sure";
  if (!result.reply) return "AI had no answer";
  if (result.reply.length > MAX_REPLY_CHARS) return "AI answer too long";
  if (/\$\s?\d/.test(result.reply.replace(/\$100\b/g, ""))) return "Mentions a dollar amount";
  if (/\b(refund|reimburs|credit|compensat|discount|coupon|cancel)/i.test(result.reply)) {
    return "Mentions refunds or cancellations";
  }
  if (/\b(follow up|follow-up|get back to you|team member will|reach out to you)\b/i.test(result.reply)) {
    return "Promised a follow-up";
  }
  if (/\b(chatbot|language model|assistant bot|Grok|xAI|Firestore|Twilio|Command Center)\b/i.test(result.reply)) {
    return "Mentions internal systems";
  }
  return null;
}

export type SupportContext = { who: string; facts: string; records: string };

/** Draft a reply and apply the guardrails. `blocked` set = goes to a person. */
export async function draftSupportReply(
  ctx: SupportContext,
  history: string,
): Promise<ModelResult & { blocked: string | null }> {
  const user = `You are texting with ${ctx.who}\n\nFACTS\n${ctx.facts}\n\nRECORDS\n${ctx.records}\n\nCONVERSATION (latest last)\n${history}\n\nWrite the next Wrrapd reply to their latest message.`;
  const result = await askModel(SYSTEM_PROMPT, user);
  return { ...result, blocked: blockReason(result) };
}

function transcript(messages: Awaited<ReturnType<typeof recentThreadMessages>>): string {
  return messages
    .filter((m) => m.channel !== "voice")
    .map((m) => {
      const who = m.direction === "in" ? "Them" : "Wrrapd";
      const body = m.body || (m.media.length ? "[photo]" : "");
      return `${who}: ${body}`;
    })
    .join("\n");
}

async function alertTeam(thread: ServiceThread, reason: string, lastText: string): Promise<void> {
  const origin = getPublicOrigin();
  const link = `${origin}/admin/service?phone=${encodeURIComponent(thread.phoneE164)}`;
  const label = `${thread.displayName} (${thread.audienceLabel}, ${formatUsPhone(thread.phoneE164)})`;
  const smsTo = process.env.SUPPORT_ALERT_SMS_TO?.trim();
  if (smsTo) {
    await sendTwilioSms({
      toE164: smsTo,
      body: `Wrrapd line needs you: ${label}. ${reason}. "${lastText.slice(0, 90)}" ${link}`,
    }).catch((err) => console.error("[support-ai] alert sms failed", err));
  }
  const emailTo = (process.env.SUPPORT_ALERT_EMAIL || process.env.NOTIFY_ADMIN_ORDER_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)[0];
  if (emailTo) {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] || c);
    await sendTransactionalEmail({
      to: emailTo,
      subject: `Wrrapd line: ${reason} — ${thread.displayName}`,
      html: `<p><strong>${esc(label)}</strong></p><p>${esc(reason)}</p><blockquote>${esc(lastText)}</blockquote><p><a href="${esc(link)}">Open the conversation</a></p>`,
    }).catch((err) => console.error("[support-ai] alert email failed", err));
  }
}

async function handOff(
  thread: ServiceThread,
  doc: Record<string, unknown>,
  reason: string,
  lastText: string,
  draft: string,
): Promise<void> {
  const now = new Date().toISOString();
  await patchThread(thread.phoneE164, {
    aiSuggestion: draft ? { text: draft, reason, at: now } : { text: HOLDING_TEXT, reason, at: now },
    aiLastIntent: reason,
  });
  const lastHolding = typeof doc.aiHoldingAt === "string" ? Date.parse(doc.aiHoldingAt) : NaN;
  if (!Number.isFinite(lastHolding) || Date.now() - lastHolding > HOLDING_EVERY_MS) {
    const sent = await sendTwilioSms({ toE164: thread.phoneE164, body: HOLDING_TEXT });
    await logAutomaticSms({
      phoneRaw: thread.phoneE164,
      body: HOLDING_TEXT,
      sid: sent.sid,
      actor: AI_ACTOR,
      needsReply: true,
      extra: { aiHoldingAt: now },
    });
  }
  await alertTeam(thread, reason, lastText);
}

/**
 * Called after an inbound text is stored. Answers simple questions on its own and
 * hands everything else to a person (holding text + alert + saved draft).
 */
export async function handleInboundWithAi(thread: ServiceThread | null, body: string, mediaCount: number): Promise<void> {
  if (!thread || thread.optedOut || !supportAiConfigured()) return;
  const text = body.trim();
  if (/^(stop|stopall|unsubscribe|cancel|end|quit|start|unstop|yes)$/i.test(text)) return;
  const alertNumber = process.env.SUPPORT_ALERT_SMS_TO?.trim();
  if (alertNumber && phonesMatch(alertNumber, thread.phoneE164)) return;

  const settings = await readSupportAiSettings();
  if (!settings.enabled) return;
  const doc = (await readThreadDoc(thread.phoneE164)) || {};
  const pausedUntil = typeof doc.aiPausedUntil === "string" ? Date.parse(doc.aiPausedUntil) : NaN;
  if (doc.aiPaused === true || (Number.isFinite(pausedUntil) && pausedUntil > Date.now())) return;

  const hourAgo = Date.now() - 60 * 60 * 1000;
  const recentReplies = (Array.isArray(doc.aiReplyTimes) ? (doc.aiReplyTimes as string[]) : []).filter(
    (t) => Date.parse(t) > hourAgo,
  );
  if (recentReplies.length >= MAX_AI_REPLIES_PER_HOUR) {
    await handOff(thread, doc, "Long conversation — please take over", text, "");
    return;
  }
  if (!text && mediaCount > 0) {
    await handOff(thread, doc, "Photo received", "[photo]", "");
    return;
  }

  let result: Awaited<ReturnType<typeof draftSupportReply>>;
  try {
    const ctx = await contextFor(thread);
    const history = transcript(await recentThreadMessages(thread.phoneE164, 12));
    result = await draftSupportReply(ctx, history);
  } catch (err) {
    console.error("[support-ai] model failed", err);
    await handOff(thread, doc, "AI unavailable", text, "");
    return;
  }

  if (result.blocked) {
    await handOff(thread, doc, result.blocked, text, result.reply);
    return;
  }
  const sent = await sendTwilioSms({ toE164: thread.phoneE164, body: result.reply });
  await logAutomaticSms({
    phoneRaw: thread.phoneE164,
    body: result.reply,
    sid: sent.sid,
    actor: AI_ACTOR,
    needsReply: false,
    extra: {
      aiReplyTimes: [...recentReplies, new Date().toISOString()],
      aiLastIntent: result.intent,
      aiSuggestion: null,
    },
  });
}
