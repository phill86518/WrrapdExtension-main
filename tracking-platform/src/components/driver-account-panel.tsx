"use client";

import { FormEvent, useState } from "react";

export function DriverAccountPanel() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setSaving(true);
    const response = await fetch("/api/driver/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = (await response.json()) as { ok: boolean; error?: string };
    setSaving(false);
    if (!response.ok || !data.ok) {
      setError(data.error || "Unable to change password");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setMessage("Password changed successfully.");
  }

  return (
    <section className="mt-4 rounded-lg border p-4">
      <h3 className="text-base font-semibold">Account</h3>
      <p className="mt-1 text-xs text-slate-600">Change driver passcode (minimum 8 characters).</p>
      <form onSubmit={changePassword} className="mt-3 grid gap-2 sm:grid-cols-3">
        <input
          type="password"
          placeholder="Current password"
          className="rounded border px-3 py-2 text-sm"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="New password"
          className="rounded border px-3 py-2 text-sm"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
        />
        <button className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white" type="submit" disabled={saving}>
          {saving ? "Saving..." : "Change Password"}
        </button>
      </form>
      {message && <p className="mt-2 text-sm text-emerald-700">{message}</p>}
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
    </section>
  );
}
