"use client";

import { useMemo, useState, useTransition } from "react";
import type { AllowedZipCodesPayload, ZipCheckResult } from "@/lib/wrrapd-zip-codes-admin";

type PayloadResult = { ok: true; data: AllowedZipCodesPayload } | { ok: false; error: string };
type CheckResult = { ok: true; result: ZipCheckResult } | { ok: false; error: string };
type MutateResult =
  | { ok: true; data: AllowedZipCodesPayload; added?: number; removed?: number }
  | { ok: false; error: string };

function parseZipBlob(text: string): string[] {
  return String(text || "")
    .split(/[\s,;|]+/)
    .map((z) => z.replace(/\D/g, "").slice(0, 5))
    .filter((z) => z.length === 5);
}

function downloadCsv(zips: string[]) {
  const lines = ["postal_code", ...zips];
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wrrapd-allowed-zip-codes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function AdminZipCodesEditor({
  initial,
  onAdd,
  onRemove,
  onReplace,
  onCheck,
  onSeedFlGa,
}: {
  initial: AllowedZipCodesPayload;
  onAdd: (zips: string[]) => Promise<MutateResult>;
  onRemove: (zips: string[]) => Promise<MutateResult>;
  onReplace: (zips: string[], notes?: string) => Promise<PayloadResult>;
  onCheck: (zip: string) => Promise<CheckResult>;
  onSeedFlGa: () => Promise<PayloadResult>;
}) {
  const [data, setData] = useState(initial);
  const [addText, setAddText] = useState("");
  const [removeText, setRemoveText] = useState("");
  const [checkZip, setCheckZip] = useState("");
  const [checkResult, setCheckResult] = useState<ZipCheckResult | null>(null);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = filter.replace(/\D/g, "").slice(0, 5);
    if (!q) return data.allowedZipCodes;
    return data.allowedZipCodes.filter((z) => z.startsWith(q));
  }, [data.allowedZipCodes, filter]);

  const run = (fn: () => Promise<void>) => {
    setError(null);
    setMessage(null);
    startTransition(() => {
      void fn();
    });
  };

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Delivery allowlist</h2>
            <p className="mt-1 text-sm text-slate-600">
              {data.count.toLocaleString()} ZIP codes allowed
              {data.updatedAt ? ` · updated ${new Date(data.updatedAt).toLocaleString()}` : ""}
            </p>
            {data.notes ? <p className="mt-1 text-xs text-slate-500">{data.notes}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => downloadCsv(data.allowedZipCodes)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              Download CSV
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  if (
                    !window.confirm(
                      "Replace the entire allowlist with all Florida + Georgia ZIPs from the county index?",
                    )
                  ) {
                    return;
                  }
                  const r = await onSeedFlGa();
                  if (!r.ok) {
                    setError(r.error);
                    return;
                  }
                  setData(r.data);
                  setMessage(`Seeded FL+GA (${r.data.count.toLocaleString()} ZIPs).`);
                })
              }
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Reseed FL + GA
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-slate-900">Check a ZIP</h3>
          <p className="mt-1 text-sm text-slate-600">See whether a 5-digit ZIP is currently allowed for delivery.</p>
          <div className="mt-3 flex gap-2">
            <input
              value={checkZip}
              onChange={(e) => setCheckZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
              inputMode="numeric"
              maxLength={5}
              placeholder="32226"
              className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={pending || checkZip.length !== 5}
              onClick={() =>
                run(async () => {
                  const r = await onCheck(checkZip);
                  if (!r.ok) {
                    setError(r.error);
                    setCheckResult(null);
                    return;
                  }
                  setCheckResult(r.result);
                })
              }
              className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              Check
            </button>
          </div>
          {checkResult ? (
            <p
              className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                checkResult.allowed
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border border-red-200 bg-red-50 text-red-900"
              }`}
            >
              <strong>{checkResult.postalCode}</strong> is{" "}
              {checkResult.allowed ? "ALLOWED" : "NOT allowed"}
              {checkResult.geo
                ? ` · ${checkResult.geo.county} County, ${checkResult.geo.state}`
                : " · not found in ZIP→county index"}
            </p>
          ) : null}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-slate-900">Filter list</h3>
          <p className="mt-1 text-sm text-slate-600">Type a prefix to narrow the on-screen list.</p>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value.replace(/\D/g, "").slice(0, 5))}
            inputMode="numeric"
            maxLength={5}
            placeholder="32"
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="mt-2 text-xs text-slate-500">
            Showing {filtered.length.toLocaleString()} of {data.count.toLocaleString()}
          </p>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-slate-900">Add ZIP codes</h3>
          <p className="mt-1 text-sm text-slate-600">
            Paste one or many 5-digit ZIPs (spaces, commas, or newlines). Duplicates are ignored.
          </p>
          <textarea
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            rows={6}
            placeholder={"32226\n30309\n30002"}
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
          />
          <button
            type="button"
            disabled={pending || parseZipBlob(addText).length === 0}
            onClick={() =>
              run(async () => {
                const zips = parseZipBlob(addText);
                const r = await onAdd(zips);
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                setData(r.data);
                setAddText("");
                setMessage(`Added ${r.added ?? 0} new ZIP(s). Allowlist now has ${r.data.count}.`);
              })
            }
            className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            Add to allowlist
          </button>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-slate-900">Remove ZIP codes</h3>
          <p className="mt-1 text-sm text-slate-600">Paste ZIPs to remove from the allowlist.</p>
          <textarea
            value={removeText}
            onChange={(e) => setRemoveText(e.target.value)}
            rows={6}
            placeholder={"10001\n90210"}
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
          />
          <button
            type="button"
            disabled={pending || parseZipBlob(removeText).length === 0}
            onClick={() =>
              run(async () => {
                const zips = parseZipBlob(removeText);
                const r = await onRemove(zips);
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                setData(r.data);
                setRemoveText("");
                setMessage(`Removed ${r.removed ?? 0} ZIP(s). Allowlist now has ${r.data.count}.`);
              })
            }
            className="mt-3 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
          >
            Remove from allowlist
          </button>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-900">Current allowlist</h3>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                if (
                  !window.confirm(
                    "Replace the entire allowlist with ONLY the currently filtered ZIPs shown below? This cannot be undone without reseed/restore.",
                  )
                ) {
                  return;
                }
                const r = await onReplace(filtered, "Replaced from filtered admin view");
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                setData(r.data);
                setMessage(`Replaced allowlist with ${r.data.count} ZIP(s).`);
              })
            }
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            Replace entire list with filtered view
          </button>
        </div>
        <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-slate-100 bg-slate-50 p-3 font-mono text-xs leading-6 text-slate-800">
          {filtered.length ? filtered.join(", ") : "No ZIPs match this filter."}
        </div>
      </section>

      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>
      ) : null}
      {pending ? <p className="text-sm text-slate-500">Working…</p> : null}
    </div>
  );
}
