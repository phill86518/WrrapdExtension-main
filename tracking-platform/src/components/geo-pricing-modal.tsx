"use client";

import { useEffect, useRef, useState } from "react";
import {
  priceFieldKeys,
  priceFieldLabel,
  type PricingConfig,
  type PricingRule,
  type UnitPrices,
  type ZipCountyIndex,
} from "@/lib/wrrapd-pricing-admin";

const EMPTY_COUNTIES: string[] = [];

function parsePrice(value: string, fallback: number): number {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n < 0 || n > 99999) return fallback;
  return Math.round(n * 1000) / 1000;
}

function emptyPrices(base: UnitPrices): UnitPrices {
  return { ...base };
}

function ruleScopeLabel(rule: PricingRule): string {
  const counties = rule.when?.counties || [];
  const states = rule.when?.states || [];
  if (counties.length) return counties.join("; ");
  if (states.length) return `State: ${states.join(", ")}`;
  return "Custom rule";
}

function defaultCountyForState(list: string[], stateCode: string): string {
  if (stateCode === "FL" && list.includes("DUVAL")) return "DUVAL";
  return list[0] || "";
}

export function GeoPricingModal({
  open,
  onClose,
  config,
  onChange,
  fetchIndex,
}: {
  open: boolean;
  onClose: () => void;
  config: PricingConfig;
  onChange: (next: PricingConfig) => void;
  fetchIndex: () => Promise<ZipCountyIndex>;
}) {
  const [index, setIndex] = useState<ZipCountyIndex | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scope, setScope] = useState<"state" | "county">("county");
  const [state, setState] = useState("FL");
  const [county, setCounty] = useState("DUVAL");
  const [prices, setPrices] = useState<UnitPrices>(() => emptyPrices(config.defaultUnitPrices));
  const loadedForOpenRef = useRef(false);
  const seedPricesRef = useRef(config.defaultUnitPrices);

  // Keep latest default prices for seeding without re-running the open loader.
  seedPricesRef.current = config.defaultUnitPrices;

  useEffect(() => {
    if (!open) {
      loadedForOpenRef.current = false;
      return;
    }
    if (loadedForOpenRef.current) return;
    loadedForOpenRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const idx = await fetchIndex();
        if (cancelled) return;
        setIndex(idx);
        setLoadError(null);
        const states = Object.keys(idx.countiesByState || {}).sort();
        const st = states.includes("FL") ? "FL" : states[0] || "FL";
        const list = idx.countiesByState[st] || [];
        setState(st);
        setCounty(defaultCountyForState(list, st));
        setPrices(emptyPrices(seedPricesRef.current));
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load counties");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, fetchIndex]);

  const counties = (index && index.countiesByState[state]) || EMPTY_COUNTIES;

  const onStateChange = (nextState: string) => {
    setState(nextState);
    const list = (index && index.countiesByState[nextState]) || EMPTY_COUNTIES;
    setCounty((current) => (list.includes(current) ? current : defaultCountyForState(list, nextState)));
  };

  if (!open) return null;

  const applyRule = () => {
    const id =
      scope === "county" && county
        ? `county-${state}-${county}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-")
        : `state-${state}`.toLowerCase();
    const label =
      scope === "county" && county ? `${county} County, ${state}` : `Entire state ${state}`;
    const when =
      scope === "county" && county ? { counties: [`${county},${state}`] } : { states: [state] };

    const nextRules = [...(config.rules || [])].filter((r) => r.id !== id);
    nextRules.push({
      id,
      label,
      when,
      unitPrices: { ...prices },
    });
    onChange({ ...config, rules: nextRules });
    onClose();
  };

  const removeRule = (id: string) => {
    onChange({ ...config, rules: (config.rules || []).filter((r) => r.id !== id) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">State / county pricing</h2>
            <p className="mt-1 text-sm text-slate-600">
              Set gift-wrap and flowers prices for a whole state or a county. Every giftee ZIP in that
              area uses these prices at checkout.
            </p>
          </div>
          <button type="button" className="text-sm text-slate-500 underline" onClick={onClose}>
            Close
          </button>
        </div>

        {loadError && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {loadError}
          </p>
        )}

        {index && (
          <p className="mt-2 text-xs text-slate-500">
            County ZIP repository: {index.zipCount.toLocaleString()} ZIPs · {index.version || "n/a"}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setScope("county")}
            className={`rounded-full px-3 py-1.5 text-sm ${
              scope === "county" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            By county
          </button>
          <button
            type="button"
            onClick={() => setScope("state")}
            className={`rounded-full px-3 py-1.5 text-sm ${
              scope === "state" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            By state
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            State
            <select
              className="mt-1 w-full rounded border px-3 py-2"
              value={state}
              onChange={(e) => onStateChange(e.target.value)}
            >
              {Object.keys(index?.countiesByState || {})
                .sort()
                .map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
            </select>
          </label>
          {scope === "county" ? (
            <label className="text-sm">
              County
              <select
                className="mt-1 w-full rounded border px-3 py-2"
                value={county}
                onChange={(e) => setCounty(e.target.value)}
              >
                {counties.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Applies to every ZIP in {state}. County rules for the same ZIP take precedence when both
              match (county rules listed after state rules win).
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {priceFieldKeys().map((key) => (
            <label key={key} className="text-sm">
              {priceFieldLabel(key)} ($)
              <input
                type="number"
                min={0}
                step={0.01}
                className="mt-1 w-full rounded border px-3 py-2"
                value={prices[key]}
                onChange={(e) =>
                  setPrices((prev) => ({ ...prev, [key]: parsePrice(e.target.value, prev[key]) }))
                }
              />
            </label>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={applyRule}
            disabled={scope === "county" && !county}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Apply to {scope === "county" ? `${county || "…"}, ${state}` : state}
          </button>
          <button type="button" onClick={onClose} className="rounded border px-4 py-2 text-sm">
            Cancel
          </button>
        </div>

        <section className="mt-6 border-t pt-4">
          <h3 className="font-semibold text-slate-900">Active geo rules</h3>
          <ul className="mt-2 space-y-2">
            {(config.rules || []).length === 0 ? (
              <li className="text-sm text-slate-500">No state/county overrides yet.</li>
            ) : (
              (config.rules || []).map((rule) => (
                <li
                  key={rule.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded border border-slate-200 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{rule.label || rule.id}</p>
                    <p className="text-xs text-slate-500">{ruleScopeLabel(rule)}</p>
                    {rule.unitPrices ? (
                      <p className="mt-1 text-xs text-slate-600">
                        Wrap ${rule.unitPrices.giftWrapBase} · AI ${rule.unitPrices.customDesignAi} ·
                        Upload ${rule.unitPrices.customDesignUpload} · Flowers $
                        {rule.unitPrices.flowers}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="text-xs text-rose-700 underline"
                    onClick={() => removeRule(rule.id)}
                  >
                    Remove
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
