"use client";

import { useMemo, useState } from "react";
import {
  priceFieldKeys,
  priceFieldLabel,
  RETAILER_LABELS,
  type PricingConfig,
  type UnitPrices,
} from "@/lib/wrrapd-pricing-admin";

type SaveResult = { ok: true; config: PricingConfig } | { ok: false; error: string };

function cloneConfig(config: PricingConfig): PricingConfig {
  return JSON.parse(JSON.stringify(config)) as PricingConfig;
}

function parsePrice(value: string, fallback: number): number {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n < 0 || n > 99999) return fallback;
  return Math.round(n * 1000) / 1000;
}

function PriceInputs({
  prefix,
  prices,
  onChange,
}: {
  prefix: string;
  prices: UnitPrices;
  onChange: (key: keyof UnitPrices, value: number) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {priceFieldKeys().map((key) => (
        <label key={key} className="block text-sm">
          <span className="font-medium text-slate-700">{priceFieldLabel(key)}</span>
          <div className="mt-1 flex items-center gap-1">
            <span className="text-slate-500">$</span>
            <input
              type="number"
              min={0}
              max={99999}
              step={0.01}
              name={`${prefix}.${key}`}
              value={prices[key]}
              onChange={(e) => onChange(key, parsePrice(e.target.value, prices[key]))}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        </label>
      ))}
    </div>
  );
}

export function AdminPricingEditor({
  initialConfig,
  saveAction,
}: {
  initialConfig: PricingConfig;
  saveAction: (config: PricingConfig) => Promise<SaveResult>;
}) {
  const [config, setConfig] = useState<PricingConfig>(() => cloneConfig(initialConfig));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const retailerSlugs = useMemo(
    () => Object.keys(config.retailers || {}).sort((a, b) => a.localeCompare(b)),
    [config.retailers],
  );

  const updateDefault = (key: keyof UnitPrices, value: number) => {
    setConfig((prev) => ({
      ...prev,
      defaultUnitPrices: { ...prev.defaultUnitPrices, [key]: value },
    }));
  };

  const updateRetailer = (slug: string, key: keyof UnitPrices, value: number) => {
    setConfig((prev) => ({
      ...prev,
      retailers: {
        ...prev.retailers,
        [slug]: { ...(prev.retailers[slug] || prev.defaultUnitPrices), [key]: value },
      },
    }));
  };

  const onSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await saveAction(config);
      if (result.ok) {
        setConfig(cloneConfig(result.config));
        setMessage({ type: "ok", text: "Pricing saved. New prices apply on the next checkout pricing refresh." });
      } else {
        setMessage({ type: "err", text: result.error });
      }
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Default prices</h2>
        <p className="mt-1 text-sm text-slate-600">
          Used when a retailer has no override, and as the fallback for new retailers.
        </p>
        <div className="mt-4">
          <PriceInputs prefix="default" prices={config.defaultUnitPrices} onChange={updateDefault} />
        </div>
        <label className="mt-4 block max-w-xs text-sm">
          <span className="font-medium text-slate-700">Global multiplier</span>
          <input
            type="number"
            min={0.01}
            max={10}
            step={0.01}
            value={config.globalMultiplier}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                globalMultiplier: parsePrice(e.target.value, prev.globalMultiplier),
              }))
            }
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Per-retailer overrides</h2>
          <p className="mt-1 text-sm text-slate-600">
            Each retailer can have its own gift-wrap, AI/upload add-ons, and flowers pricing.
          </p>
        </div>
        {retailerSlugs.map((slug) => {
          const prices = config.retailers[slug] || config.defaultUnitPrices;
          return (
            <div key={slug} className="rounded-xl border bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900">{RETAILER_LABELS[slug] || slug}</h3>
              <p className="text-xs uppercase tracking-wide text-slate-500">{slug}</p>
              <div className="mt-3">
                <PriceInputs
                  prefix={`retailers.${slug}`}
                  prices={prices}
                  onChange={(key, value) => updateRetailer(slug, key, value)}
                />
              </div>
            </div>
          );
        })}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void onSave()}
          className="rounded bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save all pricing"}
        </button>
        {message && (
          <p className={`text-sm ${message.type === "ok" ? "text-green-700" : "text-red-700"}`}>{message.text}</p>
        )}
      </div>
    </div>
  );
}
