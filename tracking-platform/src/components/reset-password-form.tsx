"use client";

import { FormEvent, useState } from "react";
import type { PortalTrack } from "@/lib/wp-portal-auth";

export function ResetPasswordForm({
  appName,
  iconSrc,
  portal,
  login,
  resetKey,
  homeHref,
}: {
  appName: string;
  iconSrc: string;
  portal: PortalTrack;
  login: string;
  resetKey: string;
  homeHref: string;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const ready = login !== "" && resetKey !== "";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const next = String(data.get("password") || "");
    const again = String(data.get("confirm") || "");
    if (next !== again) {
      setError("Those passwords do not match.");
      return;
    }
    setLoading(true);
    const response = await fetch("/api/contractor/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, key: resetKey, newPassword: next, portal }),
    });
    setLoading(false);
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(body.error || "This reset link has expired. Ask for a new one.");
      return;
    }
    setDone(true);
  }

  return (
    <main className="min-h-dvh bg-[#0c0638] px-5 pt-8 text-[#0f0351] [padding-top:max(1.5rem,env(safe-area-inset-top))] md:flex md:items-center md:justify-center md:bg-[#f4f1ea] md:px-6">
      <div className="mx-auto w-full max-w-lg md:max-w-md">
        <div className="text-center">
          <img src={iconSrc} alt="" width={112} height={112} className="mx-auto h-28 w-28 rounded-[28px] bg-white shadow-lg md:h-16 md:w-16 md:rounded-2xl" />
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-white md:text-3xl md:text-[#0f0351]">{appName}</h1>
          <p className="mt-2 text-2xl leading-snug text-white/90 md:text-base md:text-[#0f0351]/75">Choose a new password</p>
        </div>
        <div className="mt-5 rounded-[28px] bg-white p-7 shadow-2xl md:rounded-2xl md:p-6 md:shadow-md">
          {!ready ? (
            <p className="text-xl leading-relaxed md:text-sm">This reset link is not valid. Ask for a new one from the sign-in page.</p>
          ) : done ? (
            <p className="text-xl leading-relaxed md:text-sm">Your password is updated. Sign in with the new one.</p>
          ) : (
            <form onSubmit={onSubmit}>
              <label className="block text-2xl font-semibold md:text-sm" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                className="mt-3 h-[4.5rem] w-full rounded-2xl border-2 border-slate-200 px-4 text-3xl outline-none focus:border-[#f6b933] md:mt-1.5 md:h-11 md:rounded-lg md:text-base"
              />
              <label className="mt-5 block text-2xl font-semibold md:mt-4 md:text-sm" htmlFor="confirm-password">
                Confirm password
              </label>
              <input
                id="confirm-password"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                className="mt-3 h-[4.5rem] w-full rounded-2xl border-2 border-slate-200 px-4 text-3xl outline-none focus:border-[#f6b933] md:mt-1.5 md:h-11 md:rounded-lg md:text-base"
              />
              <p className="mt-3 text-lg text-slate-600 md:text-sm">Use at least 10 characters.</p>
              {error ? (
                <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-lg font-medium text-rose-700 md:text-sm">{error}</p>
              ) : null}
              <button
                type="submit"
                disabled={loading}
                className="mt-5 h-[4.5rem] w-full rounded-2xl bg-[#f6b933] text-3xl font-bold text-[#0f0351] disabled:opacity-60 md:h-11 md:rounded-lg md:text-base"
              >
                {loading ? "Saving…" : "Save password"}
              </button>
            </form>
          )}
          <a href={homeHref} className="mt-5 inline-block text-xl font-semibold underline md:text-sm">
            Back to sign in
          </a>
        </div>
      </div>
    </main>
  );
}
