"use client";

import { useMemo, useState, useTransition } from "react";
import {
  PRINTER_SIZE_OPTIONS,
  printerSummary,
  type PrinterCoverageReport,
  type PrinterSiteReportRow,
  type PrinterZipCheck,
} from "@/lib/printer-coverage-admin";

type ReportResult = { ok: true; report: PrinterCoverageReport } | { ok: false; error: string };
type CheckResult = { ok: true; result: PrinterZipCheck } | { ok: false; error: string };

type RosterPrinter = {
  id: string;
  name: string;
  homePostalCode: string;
  printerSize?: string;
  status: string;
};

function downloadCsv(filename: string, rows: string[][]) {
  const text = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([text + "\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function countyLabel(geo: { county: string; state: string } | null | undefined): string {
  if (!geo) return "";
  return `${geo.county} County, ${geo.state}`;
}

export function AdminPrinterCoverage({
  initial,
  rosterPrinters,
  onSyncRoster,
  onUpsert,
  onRemove,
  onSetActive,
  onSetRadius,
  onCheck,
}: {
  initial: PrinterCoverageReport;
  rosterPrinters: RosterPrinter[];
  onSyncRoster: () => Promise<ReportResult>;
  onUpsert: (input: {
    id?: string;
    name: string;
    postalCode: string;
    printerSize?: string;
    printerModel?: string;
    notes?: string;
  }) => Promise<ReportResult>;
  onRemove: (id: string) => Promise<ReportResult>;
  onSetActive: (id: string, active: boolean) => Promise<ReportResult>;
  onSetRadius: (radiusMiles: number) => Promise<ReportResult>;
  onCheck: (zip: string) => Promise<CheckResult>;
}) {
  const [report, setReport] = useState(initial);
  const [selectedZip, setSelectedZip] = useState<string | null>(null);
  const [expandedSite, setExpandedSite] = useState<string | null>(null);
  const [radiusInput, setRadiusInput] = useState(String(initial.radiusMiles));
  const [checkZip, setCheckZip] = useState("");
  const [checkResult, setCheckResult] = useState<PrinterZipCheck | null>(null);
  const [coverageFilter, setCoverageFilter] = useState("");
  const [manual, setManual] = useState({ name: "", postalCode: "", printerSize: "", printerModel: "", notes: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sitesById = useMemo(() => new Map(report.sites.map((s) => [s.id, s])), [report.sites]);

  const filteredCovered = useMemo(() => {
    const q = coverageFilter.replace(/\D/g, "").slice(0, 5);
    if (!q) return report.coveredZips;
    return report.coveredZips.filter((z) => z.startsWith(q));
  }, [report.coveredZips, coverageFilter]);

  const rosterNotSynced = useMemo(() => {
    const synced = new Set(report.sites.map((s) => s.wrapstarId).filter(Boolean));
    return rosterPrinters.filter((r) => !synced.has(r.id));
  }, [report.sites, rosterPrinters]);

  const run = (fn: () => Promise<void>) => {
    setError(null);
    setMessage(null);
    startTransition(() => {
      void fn();
    });
  };

  const applyReport = (r: ReportResult, okMessage: string) => {
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setReport(r.report);
    setRadiusInput(String(r.report.radiusMiles));
    setMessage(okMessage);
  };

  const selectedSites: PrinterSiteReportRow[] = selectedZip
    ? (report.printerZips.find((p) => p.postalCode === selectedZip)?.siteIds ?? [])
        .map((id) => sitesById.get(id))
        .filter((s): s is PrinterSiteReportRow => !!s)
    : [];

  return (
    <div className="mt-6 space-y-6">
      {/* Summary + radius + roster sync */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-xs uppercase text-slate-500">Printer sites</p>
              <p className="mt-1 text-2xl font-semibold">
                {report.activeSiteCount}
                <span className="text-sm font-normal text-slate-500"> active / {report.siteCount}</span>
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">Printer ZIPs</p>
              <p className="mt-1 text-2xl font-semibold">{report.printerZips.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">Giftee ZIPs covered</p>
              <p className="mt-1 text-2xl font-semibold">{report.coveredZipCount.toLocaleString()}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-600">
              Coverage radius (miles)
              <div className="mt-1 flex gap-2">
                <input
                  value={radiusInput}
                  onChange={(e) => setRadiusInput(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))}
                  inputMode="decimal"
                  className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={pending || !Number(radiusInput) || Number(radiusInput) === report.radiusMiles}
                  onClick={() =>
                    run(async () => {
                      const r = await onSetRadius(Number(radiusInput));
                      applyReport(r, `Coverage radius set to ${Number(radiusInput)} mi — ${r.ok ? r.report.coveredZipCount : ""} giftee ZIPs now covered.`);
                    })
                  }
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await onSyncRoster();
                  applyReport(r, "Synced printer sites from the WrapStar roster (manual sites kept).");
                })
              }
              className="rounded-lg bg-fuchsia-700 px-3 py-2 text-sm font-medium text-white hover:bg-fuchsia-800 disabled:opacity-50"
            >
              Sync from WrapStar roster
            </button>
            <button
              type="button"
              disabled={pending || !report.coveredZips.length}
              onClick={() => {
                const rows: string[][] = [["giftee_zip", "printer_sites"]];
                for (const z of report.coveredZips) {
                  const who = report.sites
                    .filter((s) => s.active && s.coveredZips.some((c) => c.zip === z))
                    .map((s) => `${s.name} (${s.postalCode})`)
                    .join("; ");
                  rows.push([z, who]);
                }
                downloadCsv(`wrrapd-custom-design-coverage-${new Date().toISOString().slice(0, 10)}.csv`, rows);
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              Download coverage CSV
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {report.updatedAt ? `Updated ${new Date(report.updatedAt).toLocaleString()} · ` : ""}
          Centroids: {report.centroids.zipCount.toLocaleString()} US ZIPs ({report.centroids.version}).
          {report.notes ? ` · ${report.notes}` : ""}
        </p>
        {rosterNotSynced.length ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {rosterNotSynced.length} roster WrapStar(s) flagged with a printer are not on the pay server yet:{" "}
            {rosterNotSynced.map((r) => `${r.name} (${r.homePostalCode}, ${r.status})`).join(", ")}. Click{" "}
            <strong>Sync from WrapStar roster</strong>.
          </p>
        ) : null}
      </div>

      {/* Printer ZIP flags */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Where printers sit</h2>
        <p className="mt-1 text-sm text-slate-600">
          One flag per ZIP that hosts a printer. Click a ZIP to see the WrapStar(s) and printer type; each active
          flag unlocks custom designs for every giftee ZIP within {report.radiusMiles} miles.
        </p>
        {report.printerZips.length === 0 ? (
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            No printer sites yet — custom designs are hidden everywhere. Sync from the roster or add a site below.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {report.printerZips.map((chip) => {
              const active = chip.activeCount > 0;
              const selected = selectedZip === chip.postalCode;
              return (
                <button
                  key={chip.postalCode}
                  type="button"
                  onClick={() => setSelectedZip(selected ? null : chip.postalCode)}
                  className={`rounded-full border px-3 py-1.5 font-mono text-sm shadow-sm transition ${
                    selected
                      ? "border-fuchsia-700 bg-fuchsia-700 text-white"
                      : active
                        ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900 hover:bg-fuchsia-100"
                        : "border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                  title={countyLabel(chip.geo)}
                >
                  🚩 {chip.postalCode}
                  {chip.siteIds.length > 1 ? ` ×${chip.siteIds.length}` : ""}
                  {!active ? " (paused)" : ""}
                </button>
              );
            })}
          </div>
        )}

        {selectedZip ? (
          <div className="mt-4 rounded-xl border-2 border-fuchsia-200 bg-fuchsia-50/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-lg font-semibold text-slate-900">🚩 {selectedZip}</p>
                <p className="text-xs text-slate-600">
                  {countyLabel(report.printerZips.find((p) => p.postalCode === selectedZip)?.geo) || "County unknown"}
                </p>
              </div>
              <button type="button" onClick={() => setSelectedZip(null)} className="text-xs text-slate-500 underline">
                Close
              </button>
            </div>
            <ul className="mt-3 space-y-3">
              {selectedSites.map((s) => (
                <li key={s.id} className="rounded-lg border border-white bg-white p-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {s.name}
                        {s.wrapstarId ? (
                          <a href={`/admin/wrapstars/${s.wrapstarId}`} className="ml-2 font-mono text-xs text-blue-700 underline">
                            {s.wrapstarId}
                          </a>
                        ) : (
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase text-slate-600">manual</span>
                        )}
                      </p>
                      <p className="text-sm text-slate-700">
                        Printer: <strong>{printerSummary(s) || "not recorded"}</strong>
                        {s.notes ? ` · ${s.notes}` : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        {s.active
                          ? `Covers ${s.coveredZipCount} giftee ZIP(s) within ${report.radiusMiles} mi`
                          : "Paused — not unlocking custom designs"}
                        {!s.knownCentroid ? " · ZIP not in centroid table (no radius coverage)" : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setExpandedSite(expandedSite === s.id ? null : s.id)}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                      >
                        {expandedSite === s.id ? "Hide ZIPs" : "Show covered ZIPs"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(async () => {
                            const r = await onSetActive(s.id, !s.active);
                            applyReport(r, `${s.name} ${s.active ? "paused" : "resumed"}.`);
                          })
                        }
                        className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {s.active ? "Pause" : "Resume"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(async () => {
                            if (!window.confirm(`Remove printer site for ${s.name} (${s.postalCode})? Roster sites come back on the next roster sync unless the WrapStar's printer flag is cleared.`)) return;
                            const r = await onRemove(s.id);
                            applyReport(r, `Removed ${s.name}.`);
                            setSelectedZip(null);
                          })
                        }
                        className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-900 hover:bg-red-100 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {expandedSite === s.id ? (
                    <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs leading-6 text-slate-800">
                      {s.coveredZips.length ? (
                        s.coveredZips.map((c) => (
                          <span key={c.zip} className="mr-3 inline-block font-mono" title={c.county ? `${c.county} County, ${c.state}` : ""}>
                            {c.zip} <span className="text-slate-500">({c.distanceMiles} mi)</span>
                          </span>
                        ))
                      ) : (
                        "No ZIPs in range."
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Check a giftee ZIP */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-slate-900">Check a giftee ZIP</h3>
          <p className="mt-1 text-sm text-slate-600">
            Exactly what the gift modal asks: will upload / AI designs show for this giftee ZIP?
          </p>
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
            <div
              className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                checkResult.available
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border border-red-200 bg-red-50 text-red-900"
              }`}
            >
              <p>
                <strong>{checkResult.postalCode}</strong>
                {checkResult.geo ? ` (${countyLabel(checkResult.geo)})` : ""} —{" "}
                {checkResult.available ? "custom designs SHOWN" : "custom designs HIDDEN"}
              </p>
              {checkResult.sites.length ? (
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {checkResult.sites.map((s) => (
                    <li key={s.id}>
                      {s.name} · {s.postalCode} · {printerSummary(s) || "printer"} · {s.distanceMiles} mi
                    </li>
                  ))}
                </ul>
              ) : checkResult.nearestOutOfRange ? (
                <p className="mt-1 text-xs">
                  Nearest printer: {checkResult.nearestOutOfRange.name}
                  {printerSummary(checkResult.nearestOutOfRange) ? ` (${printerSummary(checkResult.nearestOutOfRange)})` : ""} at{" "}
                  {checkResult.nearestOutOfRange.postalCode} (
                  {checkResult.nearestOutOfRange.distanceMiles} mi — outside the {checkResult.radiusMiles} mi radius).
                </p>
              ) : !checkResult.knownCentroid ? (
                <p className="mt-1 text-xs">ZIP not found in the centroid table.</p>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* Manual printer site */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-slate-900">Add a printer site manually</h3>
          <p className="mt-1 text-sm text-slate-600">
            For a printer that isn&apos;t on the roster yet (e.g. HQ, a partner print shop). Manual sites survive roster syncs.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              value={manual.name}
              onChange={(e) => setManual({ ...manual, name: e.target.value })}
              placeholder="Name (e.g. Wrrapd HQ)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={manual.postalCode}
              onChange={(e) => setManual({ ...manual, postalCode: e.target.value.replace(/\D/g, "").slice(0, 5) })}
              inputMode="numeric"
              maxLength={5}
              placeholder="Printer ZIP"
              className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            />
            <input
              value={manual.printerModel}
              onChange={(e) => setManual({ ...manual, printerModel: e.target.value })}
              placeholder="Printer model (e.g. Epson SureColor P6570D)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={manual.printerSize}
              onChange={(e) => setManual({ ...manual, printerSize: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Printer size (optional)</option>
              {PRINTER_SIZE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              value={manual.notes}
              onChange={(e) => setManual({ ...manual, notes: e.target.value })}
              placeholder="Notes (optional)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={pending || !manual.name.trim() || manual.postalCode.length !== 5}
            onClick={() =>
              run(async () => {
                const r = await onUpsert({
                  name: manual.name.trim(),
                  postalCode: manual.postalCode,
                  printerSize: manual.printerSize || undefined,
                  printerModel: manual.printerModel.trim() || undefined,
                  notes: manual.notes.trim() || undefined,
                });
                applyReport(r, `Added printer site ${manual.name.trim()} at ${manual.postalCode}.`);
                if (r.ok) setManual({ name: "", postalCode: "", printerSize: "", printerModel: "", notes: "" });
              })
            }
            className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            Add printer site
          </button>
        </section>
      </div>

      {/* Sites table */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-slate-900">All printer sites</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">WrapStar / site</th>
                <th className="px-3 py-2">Printer ZIP</th>
                <th className="px-3 py-2">County</th>
                <th className="px-3 py-2">Printer</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Covered ZIPs</th>
              </tr>
            </thead>
            <tbody>
              {report.sites.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-sm text-slate-500">
                    No printer sites.
                  </td>
                </tr>
              ) : (
                report.sites.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">
                      {s.name}
                      {s.wrapstarId ? <span className="ml-2 font-mono text-xs text-slate-500">{s.wrapstarId}</span> : null}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      <button type="button" onClick={() => setSelectedZip(s.postalCode)} className="text-blue-700 underline">
                        {s.postalCode}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-xs">{countyLabel(s.geo) || "—"}</td>
                    <td className="px-3 py-2 text-xs">{printerSummary(s) || "—"}</td>
                    <td className="px-3 py-2 text-xs">{s.source}</td>
                    <td className="px-3 py-2 text-xs">
                      {s.active ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-900">active</span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-700">paused</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{s.active ? s.coveredZipCount : 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Covered ZIP list */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-900">Giftee ZIPs with custom designs enabled</h3>
          <input
            value={coverageFilter}
            onChange={(e) => setCoverageFilter(e.target.value.replace(/\D/g, "").slice(0, 5))}
            inputMode="numeric"
            maxLength={5}
            placeholder="Filter prefix, e.g. 322"
            className="w-44 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Showing {filteredCovered.length.toLocaleString()} of {report.coveredZipCount.toLocaleString()}. A giftee ZIP
          must also be on the delivery allowlist for the modal to open at all.
        </p>
        <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-slate-100 bg-slate-50 p-3 font-mono text-xs leading-6 text-slate-800">
          {filteredCovered.length ? filteredCovered.join(", ") : "No covered ZIPs match."}
        </div>
      </section>

      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{message}</p>
      ) : null}
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p> : null}
      {pending ? <p className="text-sm text-slate-500">Working…</p> : null}
    </div>
  );
}
