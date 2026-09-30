import type { CollectionReference, DocumentReference } from "firebase-admin/firestore";
import { toUsE164 } from "@/lib/customer-notify";
import { getFirestoreDb } from "@/lib/firebase-admin";
import { listDeliveryDrivers } from "@/lib/driver-registry";
import { listDriverApplications } from "@/lib/driver-applications-admin";
import { listWrapriderApplications } from "@/lib/wraprider-applications-admin";
import { listWrapriders } from "@/lib/wraprider-registry";
import { listWrapstarApplications } from "@/lib/wrapstar-applications-admin";
import { listRegisteredWrapstars } from "@/lib/wrapstar-registry";
import { trackingServiceThreadsCollection } from "@/lib/tracking-firestore";
import type { Order } from "@/lib/types";
import { sendTwilioSms, twilioCreds } from "@/lib/twilio-rest";

export type ServiceAudience =
  | "customer"
  | "wrapstar"
  | "joyrider"
  | "wraprider"
  | "wrapstar_applicant"
  | "joyrider_applicant"
  | "wraprider_applicant"
  | "unknown";

export type ServiceThreadStatus = "open" | "waiting" | "resolved";

export type ServiceMedia = { url: string; contentType: string };

export type ServiceMessage = {
  id: string;
  direction: "in" | "out";
  channel: "sms" | "mms" | "voice";
  body: string;
  media: ServiceMedia[];
  recordingUrl?: string;
  callStatus?: string;
  callDurationSec?: number;
  createdAt: string;
  actor?: string;
};

export type ServiceLink = {
  label: string;
  href: string;
};

export type ServiceThread = {
  id: string;
  phoneE164: string;
  displayName: string;
  audience: ServiceAudience;
  audienceLabel: string;
  links: ServiceLink[];
  lastMessageAt: string;
  lastDirection: "in" | "out";
  lastPreview: string;
  lastChannel: "sms" | "mms" | "voice";
  unreadCount: number;
  needsReply: boolean;
  status: ServiceThreadStatus;
  optedOut: boolean;
  updatedAt: string;
};

const CLOSED_ORDER = new Set(["delivered", "cancelled", "refunded"]);
const OPT_OUT = /^(stop|stopall|unsubscribe|cancel|end|quit)$/i;
const OPT_IN = /^(start|unstop|yes)$/i;

const AUDIENCE_LABEL: Record<ServiceAudience, string> = {
  customer: "Shopper",
  wrapstar: "WrapStar",
  joyrider: "JoyRider",
  wraprider: "WrapRider",
  wrapstar_applicant: "WrapStar applicant",
  joyrider_applicant: "JoyRider applicant",
  wraprider_applicant: "WrapRider applicant",
  unknown: "New number",
};

export function formatUsPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return e164;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

export function phoneDocId(e164: string): string {
  return e164.replace(/\D/g, "");
}

export function phonesMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const da = a.replace(/\D/g, "");
  const db = b.replace(/\D/g, "");
  if (da.length < 10 || db.length < 10) return false;
  return da.slice(-10) === db.slice(-10);
}

function phoneVariants(e164: string): string[] {
  const digits = e164.replace(/\D/g, "");
  const last10 = digits.slice(-10);
  const pretty =
    last10.length === 10 ? `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}` : "";
  const dashed = last10.length === 10 ? `${last10.slice(0, 3)}-${last10.slice(3, 6)}-${last10.slice(6)}` : "";
  return [
    ...new Set(
      [e164, `+${digits}`, digits, last10, `1${last10}`, pretty, dashed].filter((v) => v.length > 0),
    ),
  ].slice(0, 10);
}

function threadsCol(): CollectionReference {
  const col = trackingServiceThreadsCollection();
  if (!col) throw new Error("Customer service storage is not configured");
  return col;
}

function threadRef(e164: string): DocumentReference {
  return threadsCol().doc(phoneDocId(e164));
}

function asThread(id: string, raw: Record<string, unknown>): ServiceThread {
  const audience = (typeof raw.audience === "string" ? raw.audience : "unknown") as ServiceAudience;
  const links = Array.isArray(raw.links)
    ? raw.links
        .map((link) => {
          if (!link || typeof link !== "object") return null;
          const row = link as Record<string, unknown>;
          if (typeof row.label !== "string" || typeof row.href !== "string") return null;
          return { label: row.label, href: row.href };
        })
        .filter((link): link is ServiceLink => Boolean(link))
    : [];
  return {
    id,
    phoneE164: typeof raw.phoneE164 === "string" ? raw.phoneE164 : `+${id}`,
    displayName: typeof raw.displayName === "string" && raw.displayName ? raw.displayName : formatUsPhone(`+${id}`),
    audience: AUDIENCE_LABEL[audience] ? audience : "unknown",
    audienceLabel: AUDIENCE_LABEL[AUDIENCE_LABEL[audience] ? audience : "unknown"],
    links,
    lastMessageAt: typeof raw.lastMessageAt === "string" ? raw.lastMessageAt : "",
    lastDirection: raw.lastDirection === "out" ? "out" : "in",
    lastPreview: typeof raw.lastPreview === "string" ? raw.lastPreview : "",
    lastChannel: raw.lastChannel === "mms" || raw.lastChannel === "voice" ? raw.lastChannel : "sms",
    unreadCount: typeof raw.unreadCount === "number" ? raw.unreadCount : 0,
    needsReply: raw.needsReply === true,
    status: raw.status === "waiting" || raw.status === "resolved" ? raw.status : "open",
    optedOut: raw.optedOut === true,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  };
}

function asMessage(id: string, raw: Record<string, unknown>): ServiceMessage {
  const media = Array.isArray(raw.media)
    ? raw.media
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          if (typeof row.url !== "string") return null;
          return {
            url: row.url,
            contentType: typeof row.contentType === "string" ? row.contentType : "application/octet-stream",
          };
        })
        .filter((item): item is ServiceMedia => Boolean(item))
    : [];
  return {
    id,
    direction: raw.direction === "out" ? "out" : "in",
    channel: raw.channel === "mms" || raw.channel === "voice" ? raw.channel : "sms",
    body: typeof raw.body === "string" ? raw.body : "",
    media,
    recordingUrl: typeof raw.recordingUrl === "string" ? raw.recordingUrl : undefined,
    callStatus: typeof raw.callStatus === "string" ? raw.callStatus : undefined,
    callDurationSec: typeof raw.callDurationSec === "number" ? raw.callDurationSec : undefined,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    actor: typeof raw.actor === "string" ? raw.actor : undefined,
  };
}

type Identity = {
  displayName: string;
  audience: ServiceAudience;
  links: ServiceLink[];
};

async function findOrdersByPhone(e164: string): Promise<Order[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  const snap = await db.collection("orders").where("customerPhone", "in", phoneVariants(e164)).limit(20).get();
  return snap.docs.map((doc) => doc.data() as Order);
}

async function resolveIdentity(e164: string): Promise<Identity> {
  const fallbackName = formatUsPhone(e164);
  const last10 = e164.replace(/\D/g, "").slice(-10);
  try {
    const [wrapriders, drivers, wrapstars, orders] = await Promise.all([
      listWrapriders().catch(() => []),
      listDeliveryDrivers().catch(() => []),
      listRegisteredWrapstars().catch(() => []),
      findOrdersByPhone(e164).catch(() => []),
    ]);

    const rider = wrapriders.find((row) => phonesMatch(row.phone, e164));
    if (rider) {
      return {
        displayName: rider.name || fallbackName,
        audience: "wraprider",
        links: [{ label: "WrapRider profile", href: `/admin/wrapriders/${rider.id}` }],
      };
    }
    const joy = drivers.find((row) => row.hireRole !== "wraprider" && phonesMatch(row.phone, e164));
    if (joy) {
      return {
        displayName: joy.name || fallbackName,
        audience: "joyrider",
        links: [{ label: "JoyRider profile", href: `/admin/drivers/${joy.id}` }],
      };
    }
    const star = wrapstars.find((row) => row.hireRole !== "wraprider" && phonesMatch(row.phone, e164));
    if (star) {
      return {
        displayName: star.name || fallbackName,
        audience: "wrapstar",
        links: [{ label: "WrapStar profile", href: `/admin/wrapstars/${star.id}` }],
      };
    }

    const sortedOrders = [...orders].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    const liveOrder = sortedOrders.find((order) => !CLOSED_ORDER.has(order.status)) || sortedOrders[0];
    if (liveOrder) {
      return {
        displayName: liveOrder.customerName || fallbackName,
        audience: "customer",
        links: [
          {
            label: liveOrder.externalOrderId
              ? `Order ${liveOrder.externalOrderId}`
              : `Order ${liveOrder.id}`,
            href: `/admin/orders/${liveOrder.id}`,
          },
        ],
      };
    }

    const [wrapApps, joyApps, riderApps] = await Promise.all([
      listWrapstarApplications(undefined, last10).catch(() => []),
      listDriverApplications(undefined, last10).catch(() => []),
      listWrapriderApplications(undefined, last10).catch(() => []),
    ]);
    const wrapApp = wrapApps.find((row) => phonesMatch(row.phoneMobile, e164));
    if (wrapApp) {
      return {
        displayName: wrapApp.fullName || fallbackName,
        audience: "wrapstar_applicant",
        links: [{ label: "WrapStar application", href: `/admin/applications/${wrapApp.id}?role=wrapstar` }],
      };
    }
    const joyApp = joyApps.find((row) => phonesMatch(row.phoneMobile, e164));
    if (joyApp) {
      return {
        displayName: joyApp.fullName || fallbackName,
        audience: "joyrider_applicant",
        links: [{ label: "JoyRider application", href: `/admin/applications/${joyApp.id}?role=driver` }],
      };
    }
    const riderApp = riderApps.find((row) => phonesMatch(row.phoneMobile, e164));
    if (riderApp) {
      return {
        displayName: riderApp.fullName || fallbackName,
        audience: "wraprider_applicant",
        links: [{ label: "WrapRider application", href: `/admin/applications/${riderApp.id}?role=wraprider` }],
      };
    }
  } catch (err) {
    console.error("[service-desk] identity lookup failed", err);
  }
  return { displayName: fallbackName, audience: "unknown", links: [] };
}

function previewFor(channel: ServiceMessage["channel"], body: string, mediaCount: number): string {
  const text = body.trim();
  if (channel === "voice") return text || "Phone call";
  if (text) return text.slice(0, 160);
  if (mediaCount > 0) return mediaCount === 1 ? "Photo" : `${mediaCount} photos`;
  return "Message";
}

export async function listServiceThreads(limit = 200): Promise<ServiceThread[]> {
  const snap = await threadsCol().orderBy("lastMessageAt", "desc").limit(limit).get();
  return snap.docs.map((doc) => asThread(doc.id, doc.data() as Record<string, unknown>));
}

export async function getServiceThread(phoneRaw: string): Promise<{
  thread: ServiceThread;
  messages: ServiceMessage[];
} | null> {
  const e164 = toUsE164(phoneRaw);
  if (!e164) return null;
  const ref = threadRef(e164);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const messagesSnap = await ref.collection("messages").orderBy("createdAt", "asc").limit(300).get();
  if ((snap.data()?.unreadCount || 0) > 0) {
    await ref.set({ unreadCount: 0, updatedAt: new Date().toISOString() }, { merge: true });
  }
  const thread = asThread(snap.id, { ...(snap.data() as Record<string, unknown>), unreadCount: 0 });
  return {
    thread,
    messages: messagesSnap.docs.map((doc) => asMessage(doc.id, doc.data() as Record<string, unknown>)),
  };
}

type InboundInput = {
  sid: string;
  fromRaw: string;
  channel: "sms" | "mms" | "voice";
  body: string;
  media?: ServiceMedia[];
  callStatus?: string;
};

export async function recordInbound(input: InboundInput): Promise<ServiceThread | null> {
  const e164 = toUsE164(input.fromRaw);
  if (!e164 || !input.sid) return null;
  const ourNumber = twilioCreds()?.from;
  if (ourNumber && phonesMatch(ourNumber, e164)) return null;

  const ref = threadRef(e164);
  const msgRef = ref.collection("messages").doc(input.sid);
  const now = new Date().toISOString();
  const existingMsg = await msgRef.get();
  if (existingMsg.exists) {
    const threadSnap = await ref.get();
    return threadSnap.exists ? asThread(threadSnap.id, threadSnap.data() as Record<string, unknown>) : null;
  }

  const threadSnap = await ref.get();
  const prev = (threadSnap.data() || {}) as Record<string, unknown>;
  const identity =
    typeof prev.displayName === "string" && prev.audience && prev.audience !== "unknown"
      ? {
          displayName: String(prev.displayName),
          audience: prev.audience as ServiceAudience,
          links: Array.isArray(prev.links) ? (prev.links as ServiceLink[]) : [],
        }
      : await resolveIdentity(e164);

  const trimmed = input.body.trim();
  let optedOut = prev.optedOut === true;
  if (OPT_OUT.test(trimmed)) optedOut = true;
  if (OPT_IN.test(trimmed)) optedOut = false;

  const media = input.media || [];
  const preview = previewFor(input.channel, trimmed, media.length);
  await msgRef.set({
    direction: "in",
    channel: input.channel,
    body: trimmed,
    media,
    callStatus: input.callStatus || null,
    createdAt: now,
  });
  const next: Record<string, unknown> = {
    phoneE164: e164,
    displayName: identity.displayName,
    audience: identity.audience,
    links: identity.links,
    lastMessageAt: now,
    lastDirection: "in",
    lastPreview: preview,
    lastChannel: input.channel,
    unreadCount: (typeof prev.unreadCount === "number" ? prev.unreadCount : 0) + 1,
    needsReply: !optedOut,
    status: optedOut ? "resolved" : "open",
    optedOut,
    updatedAt: now,
  };
  await ref.set(next, { merge: true });
  return asThread(phoneDocId(e164), next);
}

export async function attachRecording(callSid: string, fromRaw: string, recordingUrl: string): Promise<void> {
  const e164 = toUsE164(fromRaw);
  if (!e164 || !callSid || !recordingUrl) return;
  const ref = threadRef(e164).collection("messages").doc(callSid);
  const snap = await ref.get();
  if (!snap.exists) {
    await recordInbound({
      sid: callSid,
      fromRaw,
      channel: "voice",
      body: "Voicemail",
      callStatus: "completed",
    });
  }
  await ref.set({ recordingUrl }, { merge: true });
  await threadRef(e164).set(
    { lastPreview: "Voicemail", lastChannel: "voice", updatedAt: new Date().toISOString() },
    { merge: true },
  );
}

export async function updateCallStatus(callSid: string, fromRaw: string, status: string, durationSec?: number): Promise<void> {
  const e164 = toUsE164(fromRaw);
  if (!e164 || !callSid) return;
  const patch: Record<string, unknown> = { callStatus: status };
  if (typeof durationSec === "number" && Number.isFinite(durationSec)) patch.callDurationSec = durationSec;
  await threadRef(e164).collection("messages").doc(callSid).set(patch, { merge: true });
}

/** Automatic text (for example after a call). Keeps the thread in the reply queue. */
export async function logSystemSms(phoneRaw: string, body: string, sid: string): Promise<void> {
  const e164 = toUsE164(phoneRaw);
  const text = body.trim();
  if (!e164 || !text || !sid) return;
  const ref = threadRef(e164);
  const snap = await ref.get();
  if (snap.data()?.optedOut === true) return;
  const now = new Date().toISOString();
  await ref.collection("messages").doc(sid).set({
    direction: "out",
    channel: "sms",
    body: text.slice(0, 1500),
    media: [],
    createdAt: now,
    actor: "Wrrapd",
  });
  await ref.set(
    {
      phoneE164: e164,
      lastMessageAt: now,
      lastDirection: "out",
      lastPreview: text.slice(0, 160),
      lastChannel: "sms",
      needsReply: true,
      status: "open",
      updatedAt: now,
    },
    { merge: true },
  );
}

export async function replyOnThread(opts: {
  phoneRaw: string;
  body: string;
  actor: string;
}): Promise<ServiceThread> {
  const e164 = toUsE164(opts.phoneRaw);
  const text = opts.body.trim();
  if (!e164) throw new Error("Enter a US mobile number");
  if (!text) throw new Error("Write a message first");
  const ref = threadRef(e164);
  const snap = await ref.get();
  if (snap.exists && snap.data()?.optedOut === true) {
    throw new Error("This number opted out of texts");
  }
  const sent = await sendTwilioSms({ toE164: e164, body: text });
  const now = new Date().toISOString();
  const identity = snap.exists ? null : await resolveIdentity(e164);
  await ref.collection("messages").doc(sent.sid).set({
    direction: "out",
    channel: "sms",
    body: text.slice(0, 1500),
    media: [],
    createdAt: now,
    actor: opts.actor,
  });
  const next: Record<string, unknown> = {
    phoneE164: e164,
    ...(identity
      ? { displayName: identity.displayName, audience: identity.audience, links: identity.links }
      : {}),
    lastMessageAt: now,
    lastDirection: "out",
    lastPreview: text.slice(0, 160),
    lastChannel: "sms",
    unreadCount: 0,
    needsReply: false,
    status: "waiting",
    optedOut: false,
    updatedAt: now,
  };
  await ref.set(next, { merge: true });
  const saved = await ref.get();
  return asThread(saved.id, saved.data() as Record<string, unknown>);
}

export async function setThreadStatus(phoneRaw: string, status: ServiceThreadStatus): Promise<ServiceThread | null> {
  const e164 = toUsE164(phoneRaw);
  if (!e164) return null;
  const ref = threadRef(e164);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const now = new Date().toISOString();
  await ref.set(
    {
      status,
      needsReply: status === "open",
      unreadCount: status === "open" ? snap.data()?.unreadCount || 0 : 0,
      updatedAt: now,
    },
    { merge: true },
  );
  const saved = await ref.get();
  return asThread(saved.id, saved.data() as Record<string, unknown>);
}

export async function messageMedia(
  phoneRaw: string,
  messageId: string,
  index: string,
): Promise<ServiceMedia | null> {
  const e164 = toUsE164(phoneRaw);
  if (!e164) return null;
  const snap = await threadRef(e164).collection("messages").doc(messageId).get();
  if (!snap.exists) return null;
  const message = asMessage(snap.id, snap.data() as Record<string, unknown>);
  if (index === "recording" && message.recordingUrl) {
    return { url: message.recordingUrl, contentType: "audio/mpeg" };
  }
  const n = Number(index);
  if (!Number.isInteger(n) || n < 0) return null;
  return message.media[n] || null;
}

export function serviceSummary(threads: ServiceThread[]): { needsReply: number; waitingOver15m: number } {
  const cutoff = Date.now() - 15 * 60 * 1000;
  let needsReply = 0;
  let waitingOver15m = 0;
  for (const thread of threads) {
    if (!thread.needsReply) continue;
    needsReply += 1;
    const at = Date.parse(thread.lastMessageAt);
    if (Number.isFinite(at) && at <= cutoff) waitingOver15m += 1;
  }
  return { needsReply, waitingOver15m };
}
