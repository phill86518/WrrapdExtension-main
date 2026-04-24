"use client";

import { FormEvent, useState } from "react";
import type { DayShiftAvailability } from "@/lib/types";

type Props = {
  weekStartMonday: string;
  days: string[];
  initialDays: Record<string, DayShiftAvailability>;
  deadlineLabel: string;
};

export function DriverAvailabilityPanel({
  weekStartMonday,
  days,
  initialDays,
  deadlineLabel,
}: Props) {
  const [state, setState] = useState<Record<string, DayShiftAvailability>>(initialDays);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    setMsg("");
    const response = await fetch("/api/driver/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekStartMonday,
        days: state,
      }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    setSaving(false);
    if (!response.ok || !data.ok) {
      setErr(data.error || "Could not save availability.");
      return;
    }
    setMsg("Availability saved.");
    setTimeout(() => location.reload(), 500);
  }

  return (
    <section className="mt-4 rounded-lg border p-4">
      <h3 className="text-base font-semibold">Weekly Availability</h3>
      <p className="mt-1 text-xs text-slate-600">
        Submit your next-week availability by <strong>{deadlineLabel}</strong>. If not submitted by then, you are auto-marked unavailable (admin can override).
      </p>
      <form onSubmit={submit} className="mt-3 space-y-2">
        {days.map((d) => (
          <div key={d} className="rounded border px-3 py-2 text-sm">
            <p className="font-medium">{d}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="flex items-center justify-between rounded border px-2 py-1">
                <span>7:00 AM - 1:00 PM</span>
                <input
                  type="checkbox"
                  checked={state[d]?.morning ?? false}
                  onChange={(ev) =>
                    setState((prev) => ({
                      ...prev,
                      [d]: {
                        morning: ev.target.checked,
                        afternoon: prev[d]?.afternoon ?? false,
                      },
                    }))
                  }
                />
              </label>
              <label className="flex items-center justify-between rounded border px-2 py-1">
                <span>1:00 PM - 7:00 PM</span>
                <input
                  type="checkbox"
                  checked={state[d]?.afternoon ?? false}
                  onChange={(ev) =>
                    setState((prev) => ({
                      ...prev,
                      [d]: {
                        morning: prev[d]?.morning ?? false,
                        afternoon: ev.target.checked,
                      },
                    }))
                  }
                />
              </label>
            </div>
          </div>
        ))}
        <button
          className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
          type="submit"
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Availability"}
        </button>
      </form>
      {msg && <p className="mt-2 text-sm text-amber-800">{msg}</p>}
      {err && <p className="mt-2 text-sm text-rose-700">{err}</p>}
    </section>
  );
}
