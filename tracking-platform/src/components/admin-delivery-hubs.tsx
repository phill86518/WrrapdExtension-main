"use client";

import { useState, useTransition } from "react";
import type {
  DeliveryHubCheck,
  DeliveryHubInput,
  DeliveryHubKind,
  DeliveryHubReport,
  DeliveryHubRow,
} from "@/lib/delivery-hubs-admin";

type ReportResult = { ok: true; report: DeliveryHubReport } | { ok: false; error: string };
type CheckResult = { ok: true; result: DeliveryHubCheck } | { ok: false; error: string };

const KIND_ORDER: DeliveryHubKind[] = ["premium-po-box", "po-box", "street"];

const EMPTY_FORM: DeliveryHubInput = {
  name: "",
  kind: "premium-po-box",
  organization: "WRRAPD INC",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  phone: "",
  notes: "",
};

function formFromHub(h: DeliveryHubRow): DeliveryHubInput {
  return {
    id: h.id,
    name: h.name,
    kind: h.kind,
    organization: h.organization,
    addressLine1: h.addressLine1,
    addressLine2: h.addressLine2,
    city: h.city,
    state: h.state,
    postalCode: h.postalCode,
    phone: h.phone,
    notes: h.notes,
  };
}

const inputCls = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
const btnCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50";

export function AdminDeliveryHubs({
  initial,
  onUpsert,
  onRemove,
  onSetActive,
  onSetDefault,
  onCheck,
}: {
  initial: DeliveryHubReport;
  onUpsert: (input: DeliveryHubInput) => Promise<ReportResult>;
  onRemove: (id: string) => Promise<ReportResult>;
  onSetActive: (id: string, active: boolean) => Promise<ReportResult>;
  onSetDefault: (id: string) => Promise<ReportResult>;
  onCheck: (zip: string) => Promise<CheckResult>;
}) {
  const [report, setReport] = useState(initial);
  const [form, setForm] = useState<DeliveryHubInput>(EMPTY_FORM);
  const [checkZip, setCheckZip] = useState("");
  const [checkResult, setCheckResult] = useState<DeliveryHubCheck | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const activeCount = report.hubs.filter((h) => h.active).length;
  const editing = Boolean(form.id);

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
      return false;
    }
    setReport(r.report);
    setMessage(okMessage);
    return true;
  };

  const set = (key: keyof DeliveryHubInput) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <section className="mt-10 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" id="delivery-hubs">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Delivery hubs</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Retailers ship wrapped-gift orders to a hub. Each giftee ZIP goes to the{" "}
            <strong>closest active hub</strong> (straight-line miles between ZIP centers). The extension asks
            for the hub as soon as the shopper submits the giftee ZIP in the gift modal. ZIPs with no known
            location use the <strong>default</strong> hub.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-6 text-right">
          <div>
            <p className="text-xs uppercase text-slate-500">Active hubs</p>
            <p className="mt-1 text-2xl font-semibold">
              {activeCount}
              <span className="text-sm font-normal text-slate-500"> / {report.hubs.length}</span>
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Allowed ZIPs</p>
            <p className="mt-1 text-2xl font-semibold">{report.allowedZipCount.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {message ? (
        <p className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="py-2 pr-4">Hub</th>
              <th className="py-2 pr-4">Ship-to address</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Serves</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {report.hubs.map((h) => (
              <tr key={h.id} className="border-b border-slate-100 align-top">
                <td className="py-3 pr-4">
                  <p className="font-medium">{h.name}</p>
                  <p className="text-xs text-slate-500">
                    {h.id}
                    {h.geo ? ` · ${h.geo.county} County, ${h.geo.state}` : ""}
                  </p>
                  {h.notes ? <p className="mt-1 max-w-xs text-xs text-slate-500">{h.notes}</p> : null}
                </td>
                <td className="whitespace-pre-line py-3 pr-4 font-mono text-xs">
                  {h.shipLines.join("\n")}
                  {h.phone ? `\n${h.phone}` : ""}
                </td>
                <td className="py-3 pr-4 text-xs">{report.kinds[h.kind] || h.kind}</td>
                <td className="py-3 pr-4 text-xs">
                  {h.active ? (
                    <>
                      {h.servedAllowedZipCount.toLocaleString()} allowed ZIPs
                      {h.servedAllowedZipCount ? (
                        <span className="block text-slate-500">farthest {h.farthestServedMiles} mi</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-xs">
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      h.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {h.active ? "Active" : "Paused"}
                  </span>
                  {h.isDefault ? (
                    <span className="ml-1 rounded-full bg-[#0c0638] px-2 py-0.5 font-medium text-white">Default</span>
                  ) : null}
                </td>
                <td className="py-3">
                  <div className="flex flex-wrap justify-end gap-1">
                    <button
                      type="button"
                      className={btnCls}
                      disabled={pending}
                      onClick={() => {
                        setForm(formFromHub(h));
                        setMessage(null);
                        setError(null);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={btnCls}
                      disabled={pending || (h.active && activeCount <= 1)}
                      title={h.active && activeCount <= 1 ? "Keep at least one active hub" : undefined}
                      onClick={() =>
                        run(async () => {
                          const r = await onSetActive(h.id, !h.active);
                          applyReport(r, `${h.name} ${h.active ? "paused" : "turned on"}.`);
                        })
                      }
                    >
                      {h.active ? "Pause" : "Turn on"}
                    </button>
                    {!h.isDefault && h.active ? (
                      <button
                        type="button"
                        className={btnCls}
                        disabled={pending}
                        onClick={() =>
                          run(async () => {
                            const r = await onSetDefault(h.id);
                            applyReport(r, `${h.name} is now the default hub.`);
                          })
                        }
                      >
                        Make default
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={`${btnCls} text-red-700`}
                      disabled={pending || (h.active && activeCount <= 1)}
                      onClick={() => {
                        if (!window.confirm(`Remove hub "${h.name}"? Orders already placed keep their address.`)) return;
                        run(async () => {
                          const r = await onRemove(h.id);
                          applyReport(r, `${h.name} removed.`);
                        });
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <form
          className="rounded-lg border border-slate-200 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await onUpsert(form);
              if (applyReport(r, editing ? `${form.name || "Hub"} saved.` : `${form.name || "Hub"} added.`)) {
                setForm(EMPTY_FORM);
              }
            });
          }}
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{editing ? `Edit hub — ${form.id}` : "Add a hub"}</h3>
            {editing ? (
              <button type="button" className={btnCls} onClick={() => setForm(EMPTY_FORM)}>
                Cancel edit
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            For a Premium PO Box, enter the street-style address USPS gives you (e.g. 150 BUSCH DR #26067) so
            retailers that refuse PO Boxes still accept it.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-600">
              Hub name (internal)
              <input className={inputCls} value={form.name} onChange={set("name")} placeholder="Atlanta" required />
            </label>
            <label className="text-xs text-slate-600">
              Type
              <select
                className={inputCls}
                value={form.kind}
                onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as DeliveryHubKind }))}
              >
                {KIND_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {report.kinds[k] || k}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-600">
              Ship-to name
              <input className={inputCls} value={form.organization} onChange={set("organization")} placeholder="WRRAPD INC" />
            </label>
            <label className="text-xs text-slate-600">
              Phone on the label
              <input className={inputCls} value={form.phone} onChange={set("phone")} placeholder="(904) 515-2034" />
            </label>
            <label className="text-xs text-slate-600 sm:col-span-2">
              Address line 1 (street or box)
              <input
                className={inputCls}
                value={form.addressLine1}
                onChange={set("addressLine1")}
                placeholder="150 BUSCH DR #26067"
                required
              />
            </label>
            <label className="text-xs text-slate-600 sm:col-span-2">
              Address line 2 (optional)
              <input className={inputCls} value={form.addressLine2} onChange={set("addressLine2")} />
            </label>
            <label className="text-xs text-slate-600">
              City
              <input className={inputCls} value={form.city} onChange={set("city")} required />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-600">
                State
                <input
                  className={inputCls}
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase() }))}
                  placeholder="FL"
                  required
                />
              </label>
              <label className="text-xs text-slate-600">
                ZIP
                <input
                  className={inputCls}
                  value={form.postalCode}
                  onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
                  inputMode="numeric"
                  required
                />
              </label>
            </div>
            <label className="text-xs text-slate-600 sm:col-span-2">
              Notes (internal — box number, renewal date, who picks up)
              <input className={inputCls} value={form.notes} onChange={set("notes")} />
            </label>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="mt-4 rounded-lg bg-[#0c0638] px-4 py-2 text-sm font-medium text-white hover:bg-[#162a52] disabled:opacity-50"
          >
            {editing ? "Save hub" : "Add hub"}
          </button>
        </form>

        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="font-semibold">Which hub serves a giftee ZIP?</h3>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const r = await onCheck(checkZip);
                if (!r.ok) {
                  setError(r.error);
                  setCheckResult(null);
                  return;
                }
                setCheckResult(r.result);
              });
            }}
          >
            <input
              value={checkZip}
              onChange={(e) => setCheckZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
              inputMode="numeric"
              placeholder="ZIP"
              className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={pending || checkZip.length !== 5}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Check
            </button>
          </form>
          {checkResult ? (
            <div className="mt-3 text-sm">
              <p>
                <strong>{checkResult.postalCode}</strong>
                {checkResult.geo ? ` (${checkResult.geo.county} County, ${checkResult.geo.state})` : ""} →{" "}
                <strong>{checkResult.hubName}</strong>
                {checkResult.matched === "default"
                  ? " (default — ZIP location unknown)"
                  : checkResult.distanceMiles != null
                    ? ` · ${checkResult.distanceMiles} mi`
                    : ""}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {checkResult.distances.map((d) => (
                  <li key={d.id}>
                    {d.name} ({d.postalCode}){d.active ? "" : " — paused"}:{" "}
                    {d.distanceMiles == null ? "unknown" : `${d.distanceMiles} mi`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {report.updatedAt ? `Hubs updated ${new Date(report.updatedAt).toLocaleString()}.` : ""} Changes apply to
        new gift modals right away; shoppers already past the giftee ZIP keep the hub they were given.
      </p>
    </section>
  );
}
