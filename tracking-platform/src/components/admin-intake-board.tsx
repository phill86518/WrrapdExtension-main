"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { HeldItem, HubReceipt } from "@/lib/types";

export type IntakeRow = {
  id: string;
  externalOrderId: string | null;
  retailer: string | null;
  retailerOrderNumbers: string[];
  customerName: string;
  recipientName: string;
  customerEmail: string | null;
  items: string[];
  wrapDay: string;
  status: string;
  hubReceipt: HubReceipt | null;
  heldItems: HeldItem[];
  missingRetailerOrder: boolean;
};

function norm(s: string | null | undefined) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matches(r: IntakeRow, q: string) {
  const n = norm(q);
  if (n.length < 3) return true;
  return [...r.retailerOrderNumbers, r.externalOrderId, r.customerName, r.recipientName, r.customerEmail, ...r.items].some(
    (h) => norm(h).includes(n),
  );
}

const RECEIPT_LABEL: Record<HubReceipt["status"], string> = {
  received: "Received",
  partial: "Partly received",
  damaged: "Damaged",
  missing: "Missing",
};

export function AdminIntakeBoard({ rows: initialRows }: { rows: IntakeRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [q, setQ] = useState("");
  const [showReceived, setShowReceived] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          matches(r, q) &&
          (showReceived ||
            q.trim().length >= 3 ||
            r.hubReceipt?.status !== "received" ||
            r.heldItems.some((it) => it.status === "held")),
      ),
    [rows, q, showReceived],
  );

  async function act(row: IntakeRow, payload: Record<string, unknown>) {
    setBusy(row.id);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(row.id)}/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Save failed");
      const o = data.order;
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                hubReceipt: o?.hubReceipt ?? null,
                retailerOrderNumbers: o?.retailerOrderNumbers ?? r.retailerOrderNumbers,
                heldItems: o?.heldItems ?? r.heldItems,
              }
            : r,
        ),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Packing slip order #, Wrrapd order #, shopper, giftee, or item"
          className="min-w-[18rem] flex-1 rounded-lg border-2 border-[#1a2744]/30 px-4 py-3 text-lg"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showReceived} onChange={(e) => setShowReceived(e.target.checked)} />
          Show received
        </label>
      </div>
      {err ? <p className="text-sm text-rose-700">{err}</p> : null}
      <p className="text-sm text-slate-600">
        {visible.length} order{visible.length === 1 ? "" : "s"}
        {q.trim().length >= 3 ? " match" : " waiting for a package"}
      </p>
      <ul className="space-y-3">
        {visible.map((r) => (
          <IntakeCard key={r.id} row={r} busy={busy === r.id} onAct={(p) => act(r, p)} />
        ))}
      </ul>
    </div>
  );
}

function IntakeCard({
  row,
  busy,
  onAct,
}: {
  row: IntakeRow;
  busy: boolean;
  onAct: (payload: Record<string, unknown>) => void;
}) {
  const [note, setNote] = useState("");
  const [ref, setRef] = useState("");
  const [extra, setExtra] = useState("");
  const receipt = row.hubReceipt;
  return (
    <li className="rounded-xl border border-[#1a2744]/25 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/admin/orders/${encodeURIComponent(row.id)}`} className="font-bold text-blue-800 underline">
            {row.externalOrderId || row.id}
          </Link>
          <span className="ml-2 text-sm uppercase text-slate-500">{row.retailer || "retailer ?"}</span>
          <p className="mt-1 text-sm">
            Retailer order #:{" "}
            {row.retailerOrderNumbers.length ? (
              <strong className="font-mono">{row.retailerOrderNumbers.join(", ")}</strong>
            ) : (
              <span className={row.missingRetailerOrder ? "font-bold text-rose-700" : "text-amber-700"}>
                {row.missingRetailerOrder ? "none since yesterday, check with shopper" : "not captured"}
              </span>
            )}
          </p>
          <p className="text-sm">
            Shopper <strong>{row.customerName}</strong> → giftee <strong>{row.recipientName}</strong> · wrap day {row.wrapDay}
          </p>
          {row.items.length ? <p className="mt-1 text-sm text-slate-700">{row.items.join(" · ")}</p> : null}
        </div>
        <div className="text-right text-sm">
          {receipt ? (
            <p className={receipt.status === "received" ? "font-bold text-emerald-700" : "font-bold text-rose-700"}>
              {RECEIPT_LABEL[receipt.status]} · {new Date(receipt.at).toLocaleString()} · {receipt.by}
              {receipt.note ? <span className="block font-normal text-slate-700">{receipt.note}</span> : null}
            </p>
          ) : (
            <p className="font-semibold text-amber-700">Not received</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onAct({ action: "receive", status: "received", note })}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white"
        >
          Received
        </button>
        {(["partial", "damaged", "missing"] as const).map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => onAct({ action: "receive", status: s, note })}
            className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-800"
          >
            {RECEIPT_LABEL[s]}
          </button>
        ))}
        {receipt ? (
          <button type="button" disabled={busy} onClick={() => onAct({ action: "clear" })} className="text-sm underline">
            Undo
          </button>
        ) : null}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (required for damaged / partly received)"
          className="min-w-[14rem] flex-1 rounded border px-3 py-2 text-sm"
        />
      </div>
      <form
        className="mt-2 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (ref.trim()) onAct({ action: "add-ref", retailerOrderNumber: ref });
          setRef("");
        }}
      >
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="Add retailer order # from the packing slip"
          className="rounded border px-3 py-1.5 font-mono text-sm"
        />
        <button type="submit" disabled={busy} className="rounded border px-3 py-1.5 text-sm">
          Add
        </button>
      </form>
      <form
        className="mt-2 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!extra.trim()) return;
          if (!window.confirm(`Hold "${extra.trim()}" for pickup? The shopper gets an email and text asking them to call within 48 hours.`)) return;
          onAct({ action: "hold-item", description: extra });
          setExtra("");
        }}
      >
        <input
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="Extra item in the package, not for wrapping"
          className="min-w-[16rem] rounded border px-3 py-1.5 text-sm"
        />
        <button type="submit" disabled={busy} className="rounded border border-amber-400 px-3 py-1.5 text-sm font-semibold text-amber-900">
          Hold for pickup
        </button>
      </form>
      {row.heldItems.length ? (
        <ul className="mt-2 space-y-1 text-sm">
          {row.heldItems.map((it) => (
            <li key={it.id} className="flex flex-wrap items-center gap-2 rounded bg-amber-50 px-2 py-1">
              <span>
                Held: <strong>{it.description}</strong> · pickup by {new Date(it.pickupBy).toLocaleString()}
                {it.status === "held" ? "" : ` · ${it.status === "picked_up" ? "picked up" : "closed"}${it.note ? `: ${it.note}` : ""}`}
              </span>
              {it.status === "held" ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAct({ action: "resolve-item", itemId: it.id, status: "picked_up" })}
                    className="rounded bg-emerald-700 px-2 py-1 text-xs font-bold text-white"
                  >
                    Picked up
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const n = window.prompt("What happened to the item? (for example: not collected after 48 hours, returned to shopper by mail)");
                      if (n && n.trim()) onAct({ action: "resolve-item", itemId: it.id, status: "closed", note: n });
                    }}
                    className="rounded border px-2 py-1 text-xs"
                  >
                    Close
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
