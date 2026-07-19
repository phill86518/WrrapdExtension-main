"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Order, WrapStarShift } from "@/lib/types";
import { isCustomPrintDesign, wrapPhaseLabel } from "@/lib/shift-store-client";

type Bundle = {
  shift: WrapStarShift | null;
  orders: Order[];
};

function publicRef(o: Order) {
  return o.externalOrderId?.trim() || o.id;
}

function wrapPaperLabel(o: Order): string {
  const li = o.lineItems?.[0];
  if (!li) return "Standard Wrrapd wrap";
  if (li.wrappingOption === "ai") return li.aiDesignTitle || "AI custom wrap (printed)";
  if (li.wrappingOption === "upload") return li.wrappingDesignFileName || "Uploaded custom wrap (printed)";
  if (li.wrappingOption === "wrrapd") return "Standard Wrrapd paper";
  if (li.wrappingDesignImageUrl) return li.aiDesignTitle || "Custom wrap (printed)";
  return li.wrappingOption || "Standard Wrrapd wrap";
}

export function ShiftModule() {
  const [bundle, setBundle] = useState<Bundle>({ shift: null, orders: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [barcodeDataUrl, setBarcodeDataUrl] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const liveChunkIndexRef = useRef(0);
  const recordingOrderIdRef = useRef<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/wrapstar/shift/active", {
      credentials: "include",
      cache: "no-store",
    });
    const data = (await res.json()) as Bundle & { ok?: boolean; error?: string };
    if (!res.ok) {
      setError(data.error || "Could not load shift.");
      return;
    }
    setBundle({ shift: data.shift, orders: data.orders || [] });
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const stopCamera = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const printJobs = useMemo(
    () => bundle.orders.filter((o) => isCustomPrintDesign(o)),
    [bundle.orders],
  );

  const nextOpenOrder = useMemo(() => {
    return bundle.orders.find((o) => o.wrapPhase !== "complete") ?? null;
  }, [bundle.orders]);

  const activeOrder =
    bundle.orders.find((o) => o.id === activeOrderId) ||
    nextOpenOrder ||
    bundle.orders[0] ||
    null;

  async function startShift() {
    setBusy(true);
    setError("");
    setBarcodeDataUrl(null);
    const res = await fetch("/api/wrapstar/shift/start", {
      method: "POST",
      credentials: "include",
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    setBusy(false);
    if (!res.ok || !data.ok) {
      setError(data.error || "Could not start shift.");
      return;
    }
    await refresh();
  }

  async function confirmPrints() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/wrapstar/shift/prints/confirm", {
      method: "POST",
      credentials: "include",
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    setBusy(false);
    if (!res.ok || !data.ok) {
      setError(data.error || "Could not confirm prints.");
      return;
    }
    await refresh();
  }

  async function uploadLiveChunk(orderId: string, blob: Blob, segmentIndex: number) {
    const form = new FormData();
    form.append("chunk", blob, `live-${segmentIndex}.webm`);
    form.append("segmentIndex", String(segmentIndex));
    await fetch(`/api/wrapstar/shift/orders/${orderId}/live-chunk`, {
      method: "POST",
      credentials: "include",
      body: form,
    }).catch(() => undefined);
  }

  async function beginRecording(orderId: string) {
    setError("");
    setBusy(true);
    const startRes = await fetch(`/api/wrapstar/shift/orders/${orderId}/start-video`, {
      method: "POST",
      credentials: "include",
    });
    const startData = (await startRes.json()) as { ok?: boolean; error?: string };
    setBusy(false);
    if (!startRes.ok || !startData.ok) {
      setError(startData.error || "Could not start video.");
      return;
    }
    setActiveOrderId(orderId);
    recordingOrderIdRef.current = orderId;
    liveChunkIndexRef.current = 0;
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: true,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : "";
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          chunksRef.current.push(ev.data);
          const idx = liveChunkIndexRef.current++;
          void uploadLiveChunk(orderId, ev.data, idx);
        }
      };
      recorderRef.current = recorder;
      recorder.start(10_000);
      setRecording(true);
      setElapsedSec(0);
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
      await refresh();
    } catch {
      setError("Camera/mic permission required for chain-of-custody video.");
      stopCamera();
    }
  }

  async function finishedWrapping(orderId: string) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/wrapstar/shift/orders/${orderId}/finished-wrapping`, {
      method: "POST",
      credentials: "include",
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      barcodeDataUrl?: string;
    };
    setBusy(false);
    if (!res.ok || !data.ok) {
      setError(data.error || "Could not generate barcode.");
      return;
    }
    setBarcodeDataUrl(data.barcodeDataUrl || null);
    await refresh();
    window.setTimeout(() => window.print(), 400);
  }

  async function endVideo(orderId: string) {
    setUploading(true);
    setError("");
    const recorder = recorderRef.current;
    const finalize = async (blob: Blob | null) => {
      try {
        if (blob && blob.size > 0) {
          const form = new FormData();
          form.append("video", blob, `final-${orderId}.webm`);
          const res = await fetch(`/api/wrapstar/shift/orders/${orderId}/end-video`, {
            method: "POST",
            credentials: "include",
            body: form,
          });
          const data = (await res.json()) as { ok?: boolean; error?: string };
          if (!res.ok || !data.ok) {
            throw new Error(data.error || "End video failed");
          }
        } else {
          const res = await fetch(`/api/wrapstar/shift/orders/${orderId}/end-video`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          const data = (await res.json()) as { ok?: boolean; error?: string };
          if (!res.ok || !data.ok) {
            throw new Error(data.error || "End video failed");
          }
        }
        setBarcodeDataUrl(null);
        setRecording(false);
        stopCamera();
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "End video failed");
      } finally {
        setUploading(false);
        recorderRef.current = null;
      }
    };

    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
        chunksRef.current = [];
        void finalize(blob);
      };
      recorder.stop();
    } else {
      await finalize(null);
    }
  }

  function formatElapsed(s: number) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }

  if (loading) {
    return <p className="text-sm text-slate-600">Loading shift…</p>;
  }

  if (!bundle.shift) {
    return (
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Start Shift</h2>
          <p className="mt-1 text-sm text-slate-600">
            Start your shift to load today&apos;s assigned wrap jobs (in sequence).
          </p>
        </div>
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void startShift()}
          className="w-full rounded-xl bg-amber-500 px-4 py-4 text-lg font-semibold text-slate-950 disabled:opacity-60"
        >
          {busy ? "Starting…" : "Start shift"}
        </button>
      </section>
    );
  }

  const printsDone = Boolean(bundle.shift.printsConfirmedAt);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Shift · {bundle.shift.dateKey}</h2>
        <p className="mt-1 text-sm text-slate-600">
          Started {new Date(bundle.shift.startedAt).toLocaleString()} · {bundle.orders.length}{" "}
          job(s) in assigned sequence
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {/* Step 1: Print custom wraps */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
        <h3 className="text-sm font-semibold text-slate-900">1. Print wrap paper</h3>
        <p className="mt-1 text-xs text-slate-600">
          Print every AI or uploaded custom design for today before wrapping.
        </p>
        {printJobs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No custom/AI prints for today.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {printJobs.map((o) => {
              const img =
                o.lineItems?.find((li) => li.wrappingDesignImageUrl)?.wrappingDesignImageUrl ||
                o.lineItems?.[0]?.wrappingDesignImageUrl;
              return (
                <li key={o.id} className="flex gap-3 rounded-lg border border-slate-100 p-2">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" className="h-16 w-16 rounded object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-500">
                      Design
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{publicRef(o)}</p>
                    <p className="text-xs text-slate-600">{wrapPaperLabel(o)}</p>
                    {img ? (
                      <a
                        href={img}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs font-semibold text-amber-800 underline"
                        onClick={() => window.open(img, "_blank")?.print?.()}
                      >
                        Open / print design
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!printsDone ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirmPrints()}
            className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            I&apos;ve printed all custom wraps for today
          </button>
        ) : (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
            Prints confirmed · wrapping unlocked
          </p>
        )}
      </div>

      {/* Job list */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
        <h3 className="text-sm font-semibold text-slate-900">2. Today&apos;s jobs (sequence)</h3>
        <ul className="mt-2 space-y-2">
          {bundle.orders.map((o, idx) => {
            const locked =
              printsDone &&
              bundle.orders.slice(0, idx).some((p) => p.wrapPhase !== "complete");
            const isActive = activeOrder?.id === o.id;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  disabled={!printsDone || (locked && o.wrapPhase !== "complete")}
                  onClick={() => setActiveOrderId(o.id)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                    isActive
                      ? "border-amber-500 bg-amber-50"
                      : "border-slate-200 bg-slate-50"
                  } disabled:opacity-50`}
                >
                  <span>
                    <span className="font-semibold">#{o.stopSequence ?? idx + 1}</span>{" "}
                    {publicRef(o)}
                  </span>
                  <span className="text-xs font-medium text-slate-600">
                    {locked && o.wrapPhase !== "complete"
                      ? "Locked"
                      : wrapPhaseLabel(o.wrapPhase)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Active order wrap */}
      {printsDone && activeOrder ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="print:hidden">
            <p className="text-2xl font-bold text-slate-900">
              Job #{activeOrder.stopSequence ?? "—"}
            </p>
            <p className="font-mono text-sm text-slate-700">{publicRef(activeOrder)}</p>
            <p className="mt-1 text-sm text-slate-600">
              {activeOrder.recipientName} · {activeOrder.city}, {activeOrder.state}
            </p>
            <p className="mt-2 text-sm">
              <strong>Wrap paper:</strong> {wrapPaperLabel(activeOrder)}
            </p>
          </div>

          <div className="grid gap-2 print:hidden sm:grid-cols-2">
            {(activeOrder.lineItems || []).slice(0, 4).map((li, i) => (
              <div key={i} className="flex gap-2 rounded-lg border border-slate-100 p-2">
                {li.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={li.imageUrl} alt="" className="h-14 w-14 rounded object-cover" />
                ) : (
                  <div className="h-14 w-14 rounded bg-slate-100" />
                )}
                <p className="text-xs text-slate-700 line-clamp-3">{li.title || "Item"}</p>
              </div>
            ))}
          </div>

          {barcodeDataUrl && activeOrder.wrapPhase === "label_ready" ? (
            <div className="rounded-xl border-2 border-amber-400 bg-white p-4 text-center">
              <p className="text-sm font-semibold text-slate-900 print:text-base">
                Print this QR and stick it on the original box, then place the wrapped gift inside.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={barcodeDataUrl}
                alt="Driver label QR"
                className="mx-auto mt-3 w-full max-w-xs"
              />
              <button
                type="button"
                className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold print:hidden"
                onClick={() => window.print()}
              >
                Print barcode again
              </button>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-lg bg-black print:hidden">
            <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
          </div>
          {recording ? (
            <p className="font-mono text-sm text-red-700 print:hidden">
              ● LIVE {formatElapsed(elapsedSec)} · uploading to cloud
            </p>
          ) : null}

          <div className="grid gap-2 print:hidden">
            {activeOrder.wrapPhase === "queued" || !activeOrder.wrapPhase ? (
              <button
                type="button"
                disabled={busy || activeOrder.id !== nextOpenOrder?.id}
                onClick={() => void beginRecording(activeOrder.id)}
                className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Start video
              </button>
            ) : null}

            {activeOrder.wrapPhase === "recording" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void finishedWrapping(activeOrder.id)}
                className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-60"
              >
                Finished wrapping
              </button>
            ) : null}

            {activeOrder.wrapPhase === "label_ready" ? (
              <button
                type="button"
                disabled={uploading}
                onClick={() => void endVideo(activeOrder.id)}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {uploading ? "Uploading…" : "End video"}
              </button>
            ) : null}

            {activeOrder.wrapPhase === "complete" ? (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
                Wrap complete · Admin updated · barcode generated
                {activeOrder.wrapFinishedAt
                  ? ` · ${new Date(activeOrder.wrapFinishedAt).toLocaleString()}`
                  : ""}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {!printsDone ? (
        <p className="text-center text-sm text-slate-500 print:hidden">
          Confirm prints above to unlock sequential wrapping.
        </p>
      ) : null}
    </section>
  );
}
