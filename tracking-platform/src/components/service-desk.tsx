"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Audience =
  | "customer"
  | "wrapstar"
  | "joyrider"
  | "wraprider"
  | "wrapstar_applicant"
  | "joyrider_applicant"
  | "wraprider_applicant"
  | "unknown";

type Thread = {
  id: string;
  phoneE164: string;
  displayName: string;
  audience: Audience;
  audienceLabel: string;
  links: { label: string; href: string }[];
  lastMessageAt: string;
  lastPreview: string;
  lastChannel: "sms" | "mms" | "voice";
  unreadCount: number;
  needsReply: boolean;
  status: "open" | "waiting" | "resolved";
  optedOut: boolean;
  aiPaused?: boolean;
  aiSuggestion?: { text: string; reason: string; at: string };
};

type AiSettings = { enabled: boolean; configured: boolean };

type Message = {
  id: string;
  direction: "in" | "out";
  channel: "sms" | "mms" | "voice";
  body: string;
  media: { url: string; contentType: string }[];
  recordingUrl?: string;
  callStatus?: string;
  callDurationSec?: number;
  createdAt: string;
  actor?: string;
};

type Line = { phoneNumber: string; connected: boolean; smsUrl: string; voiceUrl: string };

type FilterId = "all" | "needs" | "customers" | "applicants" | "team";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "needs", label: "Needs reply" },
  { id: "all", label: "All" },
  { id: "customers", label: "Shoppers" },
  { id: "applicants", label: "Applicants" },
  { id: "team", label: "Team" },
];

const QUICK_REPLIES = [
  "Thanks for reaching Wrrapd. We're on it and will text you back shortly.",
  "Your gift is on schedule. We'll text you when it's wrapped and headed out.",
  "We received your application. We'll text you here with the next step.",
  "Reply with the gift recipient's zip code and we'll take it from there.",
];

function waitMeta(thread: Thread): { label: string; late: boolean } {
  const at = Date.parse(thread.lastMessageAt);
  if (!Number.isFinite(at)) return { label: "", late: false };
  const min = Math.max(0, Math.floor((Date.now() - at) / 60000));
  if (!thread.needsReply) {
    if (min < 1) return { label: "Just now", late: false };
    if (min < 60) return { label: `${min}m ago`, late: false };
    return { label: `${Math.floor(min / 60)}h ago`, late: false };
  }
  if (min < 1) return { label: "Just now", late: false };
  if (min < 15) return { label: `${min}m`, late: false };
  if (min < 60) return { label: `${min}m waiting`, late: true };
  return { label: `${Math.floor(min / 60)}h waiting`, late: true };
}

function matchesFilter(thread: Thread, filter: FilterId): boolean {
  if (filter === "all") return true;
  if (filter === "needs") return thread.needsReply;
  if (filter === "customers") return thread.audience === "customer" || thread.audience === "unknown";
  if (filter === "applicants") return thread.audience.endsWith("_applicant");
  return thread.audience === "wrapstar" || thread.audience === "joyrider" || thread.audience === "wraprider";
}

function clock(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ServiceDesk() {
  const router = useRouter();
  const search = useSearchParams();
  const selected = search.get("phone") || "";
  const [threads, setThreads] = useState<Thread[]>([]);
  const [summary, setSummary] = useState({ needsReply: 0, waitingOver15m: 0 });
  const [line, setLine] = useState<Line | null>(null);
  const [configured, setConfigured] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [active, setActive] = useState<Thread | null>(null);
  const [filter, setFilter] = useState<FilterId>("needs");
  const [draft, setDraft] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [ai, setAi] = useState<AiSettings | null>(null);

  useEffect(() => {
    void fetch("/api/admin/service/ai", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AiSettings | null) => setAi(data))
      .catch(() => setAi(null));
  }, []);

  async function toggleAi() {
    if (!ai) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/service/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !ai.enabled }),
      });
      const data = (await res.json()) as AiSettings & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not update the AI assistant");
      setAi(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the AI assistant");
    } finally {
      setBusy(false);
    }
  }

  async function setThreadAi(paused: boolean) {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/service/threads/${encodeURIComponent(active.phoneE164)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiPaused: paused }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not update");
      await loadThread(active.phoneE164);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  const loadList = useCallback(async () => {
    const res = await fetch("/api/admin/service", { cache: "no-store" });
    const data = (await res.json()) as {
      threads?: Thread[];
      summary?: { needsReply: number; waitingOver15m: number };
      line?: Line | null;
      twilioConfigured?: boolean;
      error?: string;
    };
    if (!res.ok) throw new Error(data.error || "Could not load customer service");
    setThreads(data.threads || []);
    setSummary(data.summary || { needsReply: 0, waitingOver15m: 0 });
    setLine(data.line || null);
    setConfigured(data.twilioConfigured !== false);
  }, []);

  const loadThread = useCallback(async (phone: string) => {
    if (!phone) {
      setActive(null);
      setMessages([]);
      return;
    }
    const res = await fetch(`/api/admin/service/threads/${encodeURIComponent(phone)}`, { cache: "no-store" });
    if (res.status === 404) {
      setActive(null);
      setMessages([]);
      return;
    }
    const data = (await res.json()) as { thread?: Thread; messages?: Message[]; error?: string };
    if (!res.ok) throw new Error(data.error || "Could not load conversation");
    setActive(data.thread || null);
    setMessages(data.messages || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await loadList();
        if (selected) await loadThread(selected);
        if (!cancelled) setError("");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load customer service");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    };
    void run();
    const timer = window.setInterval(() => {
      void run();
    }, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loadList, loadThread, selected]);

  const visible = useMemo(
    () => threads.filter((thread) => matchesFilter(thread, filter)),
    [threads, filter],
  );

  function openThread(phone: string) {
    const params = new URLSearchParams(search.toString());
    params.set("phone", phone);
    router.replace(`/admin/service?${params.toString()}`);
    setComposing(false);
  }

  async function send(phone: string) {
    const body = draft.trim();
    if (!phone || !body) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/service/threads/${encodeURIComponent(phone)}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json()) as { error?: string; thread?: Thread };
      if (!res.ok) throw new Error(data.error || "Could not send");
      setDraft("");
      setComposing(false);
      setNewPhone("");
      openThread(data.thread?.phoneE164 || phone);
      await loadList();
      await loadThread(data.thread?.phoneE164 || phone);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  async function startNew() {
    const phone = newPhone.trim();
    if (!phone) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, body: draft }),
      });
      const data = (await res.json()) as { error?: string; thread?: Thread };
      if (!res.ok) throw new Error(data.error || "Could not send");
      setDraft("");
      setNewPhone("");
      setComposing(false);
      const next = data.thread?.phoneE164 || phone;
      openThread(next);
      await loadList();
      await loadThread(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  async function mark(status: Thread["status"]) {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/service/threads/${encodeURIComponent(active.phoneE164)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not update");
      await loadList();
      await loadThread(active.phoneE164);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/service/connect", { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not connect the number");
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect the number");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-[#1a2744]/40 bg-[#faf8f4] px-5 py-4 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#a88417]">Wrrapd line</p>
            <h1 className="text-2xl font-bold text-[#0f172a]">Customer service</h1>
            <p className="mt-1 text-sm text-[#2d4a38]">
              {line?.phoneNumber || "+1 844 638 5484"} · shoppers, WrapStars, JoyRiders, and WrapRiders
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm font-semibold">
            <span className="rounded-full bg-[#0f172a] px-3 py-1 text-white">{summary.needsReply} need a reply</span>
            <span
              className={
                summary.waitingOver15m > 0
                  ? "rounded-full bg-rose-600 px-3 py-1 text-white"
                  : "rounded-full bg-white px-3 py-1 text-[#2d4a38] ring-1 ring-[#1a2744]/20"
              }
            >
              {summary.waitingOver15m} waiting over 15 min
            </span>
            {ai ? (
              <button
                type="button"
                disabled={busy || !ai.configured}
                onClick={() => void toggleAi()}
                title={
                  ai.configured
                    ? "Answers simple questions on its own and hands everything else to you"
                    : "Add XAI_API_KEY to this server to use the AI assistant"
                }
                className={
                  ai.enabled && ai.configured
                    ? "rounded-full bg-emerald-600 px-3 py-1 text-white disabled:opacity-60"
                    : "rounded-full bg-white px-3 py-1 text-[#2d4a38] ring-1 ring-[#1a2744]/20 disabled:opacity-60"
                }
              >
                AI assistant: {ai.configured ? (ai.enabled ? "On" : "Off") : "Not set up"}
              </button>
            ) : null}
          </div>
        </div>
        {!configured ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Twilio is not configured on this server yet. Add the account SID, auth token, and from-number, then redeploy.
          </p>
        ) : null}
        {configured && line && !line.connected ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <span>Texts and calls are not landing here yet.</span>
            <button
              type="button"
              onClick={() => void connect()}
              disabled={busy}
              className="rounded-lg bg-[#0f172a] px-3 py-1.5 font-bold text-white disabled:opacity-60"
            >
              Connect number
            </button>
          </div>
        ) : null}
        {error ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
        <section className="rounded-2xl border-2 border-[#1a2744]/35 bg-[#faf8f4] shadow-lg">
          <div className="flex flex-wrap gap-1 border-b border-[#1a2744]/10 p-3">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={
                  filter === item.id
                    ? "rounded-full bg-[#0f172a] px-2.5 py-1 text-xs font-bold text-white"
                    : "rounded-full px-2.5 py-1 text-xs font-semibold text-[#1a2744] hover:bg-white"
                }
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="border-b border-[#1a2744]/10 p-3">
            <button
              type="button"
              onClick={() => setComposing((open) => !open)}
              className="w-full rounded-xl bg-gradient-to-b from-[#c9a227] to-[#a88417] px-3 py-2 text-sm font-bold text-[#1a1a12]"
            >
              Text someone
            </button>
          </div>
          <ul className="max-h-[68vh] overflow-y-auto">
            {loadingList && threads.length === 0 ? (
              <li className="px-4 py-6 text-sm text-[#2d4a38]">Loading conversations…</li>
            ) : null}
            {!loadingList && visible.length === 0 ? (
              <li className="px-4 py-6 text-sm text-[#2d4a38]">
                {filter === "needs" ? "Nothing is waiting on a reply." : "No conversations in this view."}
              </li>
            ) : null}
            {visible.map((thread) => {
              const meta = waitMeta(thread);
              const on = selected === thread.phoneE164 || selected === thread.id;
              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => openThread(thread.phoneE164)}
                    className={
                      on
                        ? "block w-full border-l-4 border-[#c9a227] bg-white px-4 py-3 text-left"
                        : "block w-full border-l-4 border-transparent px-4 py-3 text-left hover:bg-white/70"
                    }
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-bold text-[#0f172a]">{thread.displayName}</span>
                      <span className={meta.late ? "shrink-0 text-xs font-bold text-rose-700" : "shrink-0 text-xs text-[#2d4a38]"}>
                        {meta.label}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs font-semibold uppercase tracking-wide text-[#a88417]">
                      {thread.audienceLabel}
                      {thread.needsReply ? " · needs reply" : ""}
                    </span>
                    <span className="mt-1 block truncate text-sm text-[#1a2744]">{thread.lastPreview}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex min-h-[70vh] flex-col rounded-2xl border-2 border-[#1a2744]/35 bg-[#faf8f4] shadow-lg">
          {composing ? (
            <div className="border-b border-[#1a2744]/10 p-4">
              <h2 className="font-bold text-[#0f172a]">New text</h2>
              <label className="mt-3 block text-sm font-semibold text-[#1a2744]">
                Mobile number
                <input
                  value={newPhone}
                  onChange={(event) => setNewPhone(event.target.value)}
                  placeholder="(904) 555-0100"
                  className="mt-1 w-full rounded-xl border border-[#1a2744]/20 bg-white px-3 py-2"
                />
              </label>
            </div>
          ) : active ? (
            <div className="border-b border-[#1a2744]/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-[#0f172a]">{active.displayName}</h2>
                  <p className="text-sm text-[#2d4a38]">
                    {active.audienceLabel} · {active.phoneE164}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {active.links.map((link) => (
                      <Link key={link.href} href={link.href} className="text-sm font-bold text-[#0f172a] underline">
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => void mark("waiting")} className="rounded-lg border border-[#1a2744]/20 px-2.5 py-1 text-xs font-bold text-[#1a2744]">
                    Waiting on them
                  </button>
                  <button type="button" disabled={busy} onClick={() => void mark("resolved")} className="rounded-lg border border-[#1a2744]/20 px-2.5 py-1 text-xs font-bold text-[#1a2744]">
                    Resolved
                  </button>
                  <button type="button" disabled={busy} onClick={() => void mark("open")} className="rounded-lg border border-[#1a2744]/20 px-2.5 py-1 text-xs font-bold text-[#1a2744]">
                    Reopen
                  </button>
                  {ai?.configured ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setThreadAi(!active.aiPaused)}
                      className={
                        active.aiPaused
                          ? "rounded-lg border border-emerald-600/40 px-2.5 py-1 text-xs font-bold text-emerald-800"
                          : "rounded-lg border border-[#1a2744]/20 px-2.5 py-1 text-xs font-bold text-[#1a2744]"
                      }
                    >
                      {active.aiPaused ? "Let AI answer here" : "Pause AI here"}
                    </button>
                  ) : null}
                </div>
              </div>
              {active.optedOut ? (
                <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  This number opted out of texts.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="p-6 text-sm text-[#2d4a38]">Choose a conversation, or text someone new.</div>
          )}

          {!composing && active ? (
            <ol className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((message) => (
                <li key={message.id} className={message.direction === "out" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      message.direction === "out"
                        ? "max-w-[80%] rounded-2xl bg-[#0f172a] px-3 py-2 text-sm text-white"
                        : "max-w-[80%] rounded-2xl bg-white px-3 py-2 text-sm text-[#0f172a] ring-1 ring-[#1a2744]/10"
                    }
                  >
                    <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">
                      {message.channel === "voice" ? "Call" : message.direction === "out" ? message.actor || "Wrrapd" : "Them"}
                      {" · "}
                      {clock(message.createdAt)}
                    </p>
                    {message.body ? <p className="mt-1 whitespace-pre-wrap">{message.body}</p> : null}
                    {typeof message.callDurationSec === "number" ? (
                      <p className="mt-1 text-xs opacity-80">{message.callDurationSec}s · {message.callStatus}</p>
                    ) : null}
                    <div className="mt-2 space-y-2">
                      {message.media.map((item, index) =>
                        item.contentType.startsWith("image/") ? (
                          // Twilio media is fetched through our admin route.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={`${message.id}-${index}`}
                            src={`/api/admin/service/media/${active.id}/${encodeURIComponent(message.id)}/${index}`}
                            alt="Attachment"
                            className="max-h-64 rounded-lg"
                          />
                        ) : (
                          <a
                            key={`${message.id}-${index}`}
                            className="block underline"
                            href={`/api/admin/service/media/${active.id}/${encodeURIComponent(message.id)}/${index}`}
                          >
                            Attachment
                          </a>
                        ),
                      )}
                      {message.recordingUrl ? (
                        <audio controls src={`/api/admin/service/media/${active.id}/${encodeURIComponent(message.id)}/recording`} className="w-full" />
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex-1" />
          )}

          {(composing || (active && !active.optedOut)) && (
            <div className="border-t border-[#1a2744]/10 p-4">
              {!composing && active?.needsReply && active.aiSuggestion ? (
                <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
                  <p className="text-[11px] font-bold uppercase tracking-wide">
                    Held for you · {active.aiSuggestion.reason}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{active.aiSuggestion.text}</p>
                  <button
                    type="button"
                    onClick={() => setDraft(active.aiSuggestion?.text || "")}
                    className="mt-2 rounded-lg bg-[#0f172a] px-2.5 py-1 text-xs font-bold text-white"
                  >
                    Use AI draft
                  </button>
                </div>
              ) : null}
              <div className="mb-2 flex flex-wrap gap-2">
                {QUICK_REPLIES.map((lineText) => (
                  <button
                    key={lineText}
                    type="button"
                    onClick={() => setDraft(lineText)}
                    className="rounded-full bg-white px-2.5 py-1 text-left text-xs font-semibold text-[#1a2744] ring-1 ring-[#1a2744]/15"
                  >
                    {lineText.length > 48 ? `${lineText.slice(0, 48)}…` : lineText}
                  </button>
                ))}
              </div>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                placeholder="Write a text…"
                className="w-full rounded-xl border border-[#1a2744]/20 bg-white px-3 py-2 text-sm"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  disabled={busy || !draft.trim() || (composing && !newPhone.trim())}
                  onClick={() => void (composing ? startNew() : active ? send(active.phoneE164) : undefined)}
                  className="rounded-xl bg-gradient-to-b from-[#c9a227] to-[#a88417] px-4 py-2 text-sm font-bold text-[#1a1a12] disabled:opacity-50"
                >
                  Send text
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
