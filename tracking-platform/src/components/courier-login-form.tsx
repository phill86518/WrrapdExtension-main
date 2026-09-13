"use client";

import { FormEvent, useState } from "react";
import { PasswordField } from "@/components/password-field";

export function CourierLoginForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/courier/login", {
      method: "POST",
      body: formData,
      credentials: "include",
      cache: "no-store",
    });
    setLoading(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "Sign-in failed. Check your email and password.");
      return;
    }
    window.location.assign("/courier");
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-lg border p-6">
      <input
        name="email"
        type="text"
        inputMode="email"
        autoComplete="username"
        placeholder="Email address"
        className="w-full rounded border px-3 py-2"
        required
      />
      <PasswordField name="password" placeholder="Password" autoComplete="current-password" />
      <p className="text-xs text-slate-500">
        Use the same email and password as your JoyRider onboarding. New here? Apply at
        apply.wrrapd.com/drive.
      </p>
      {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
      <button
        className="w-full rounded bg-black px-4 py-3 text-lg font-semibold text-white"
        type="submit"
        disabled={loading}
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
