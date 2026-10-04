"use client";

import { useState } from "react";

export function TrackRetailerRefForm({ token, retailerLabel }: { token: string; retailerLabel: string }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  if (state === "saved") {
    return <p className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-emerald-300">Thanks!</p>;
  }

  return (
    <form
      className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("saving");
        setError("");
        try {
          const res = await fetch(`/api/public/track/${encodeURIComponent(token)}/retailer-ref`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ retailerOrderNumber: value }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Please try again.");
          setState("saved");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Please try again.");
          setState("error");
        }
      }}
    >
      <label className="block text-sm font-medium text-white" htmlFor="retailer-order-ref">
        Your {retailerLabel} order number
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          id="retailer-order-ref"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          className="min-w-[14rem] flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 font-mono text-white"
        />
        <button
          type="submit"
          disabled={state === "saving"}
          className="rounded-lg bg-[#f6b933] px-4 py-2 font-semibold text-[#0f0351]"
        >
          Save
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
    </form>
  );
}
