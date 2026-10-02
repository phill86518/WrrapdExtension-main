"use client";

import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import type { PortalTrack } from "@/lib/wp-portal-auth";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Props = {
  appName: string;
  iconSrc: string;
  action: string;
  redirectTo: string;
  blurb: string;
  portal: PortalTrack;
};

function inStandaloneApp() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    nav.standalone === true
  );
}

function subscribeStandalone(onStoreChange: () => void) {
  const standalone = window.matchMedia("(display-mode: standalone)");
  const fullscreen = window.matchMedia("(display-mode: fullscreen)");
  standalone.addEventListener("change", onStoreChange);
  fullscreen.addEventListener("change", onStoreChange);
  return () => {
    standalone.removeEventListener("change", onStoreChange);
    fullscreen.removeEventListener("change", onStoreChange);
  };
}

export function PortalLogin({ appName, iconSrc, action, redirectTo, blurb, portal }: Props) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"sign-in" | "forgot" | "sent">("sign-in");
  const [notice, setNotice] = useState("");
  const standalone = useSyncExternalStore(subscribeStandalone, inStandaloneApp, () => true);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const response = await fetch(action, {
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
    window.location.assign(redirectTo);
  }

  async function onForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    const email = String(new FormData(event.currentTarget).get("email") || "");
    const response = await fetch("/api/contractor/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, portal }),
    });
    setLoading(false);
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!response.ok) {
      setError(data.error || "We couldn't send the email. Try again in a few minutes.");
      return;
    }
    setNotice(data.message || "Check your email for a link to choose a new password.");
    setMode("sent");
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    if (choice.outcome === "accepted") setInstalled(true);
  }

  return (
    <main className="min-h-dvh bg-[#0c0638] px-5 pt-6 text-[#0f0351] [padding-bottom:max(1.5rem,env(safe-area-inset-bottom))] [padding-top:max(1.25rem,env(safe-area-inset-top))] md:flex md:items-center md:justify-center md:bg-[#f4f1ea] md:px-6 md:py-10">
      <div className="mx-auto w-full max-w-lg md:max-w-md">
      <div className="text-center">
        <img
          src={iconSrc}
          alt=""
          width={160}
          height={160}
          className="mx-auto h-28 w-28 rounded-[28px] bg-white shadow-lg md:h-16 md:w-16 md:rounded-2xl"
        />
        <h1 className="mt-4 text-5xl font-bold tracking-tight text-white md:mt-4 md:text-3xl md:text-[#0f0351]">{appName}</h1>
        <p className="mt-2 max-w-md text-2xl leading-snug text-white/90 md:mt-2 md:text-base md:text-[#0f0351]/75">{blurb}</p>
      </div>

        {mode === "sent" ? (
          <div className="mt-5 rounded-[28px] bg-white p-7 shadow-2xl md:rounded-2xl md:p-6 md:shadow-md">
            <p className="text-2xl font-semibold leading-snug md:text-base">{notice}</p>
            <button
              type="button"
              onClick={() => {
                setMode("sign-in");
                setError("");
              }}
              className="mt-6 text-xl font-semibold text-[#0f0351] underline md:text-sm"
            >
              Back to sign in
            </button>
          </div>
        ) : mode === "forgot" ? (
          <form onSubmit={onForgot} className="mt-5 rounded-[28px] bg-white p-7 shadow-2xl md:rounded-2xl md:p-6 md:shadow-md">
            <p className="text-2xl font-semibold leading-snug md:text-base">Forgot password</p>
            <p className="mt-2 text-lg leading-relaxed text-slate-600 md:text-sm">
              Enter your email. We will send a link to choose a new password.
            </p>
            <label className="mt-5 block text-2xl font-semibold md:mt-4 md:text-sm" htmlFor="portal-reset-email">
              Email
            </label>
            <input
              id="portal-reset-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              placeholder="you@email.com"
              required
              className="mt-3 h-[4.5rem] w-full rounded-2xl border-2 border-slate-200 bg-white px-4 text-3xl text-[#0f0351] outline-none placeholder:text-slate-400 focus:border-[#f6b933] md:mt-1.5 md:h-11 md:rounded-lg md:text-base"
            />
            {error ? (
              <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-lg font-medium leading-snug text-rose-700 md:text-sm">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className="mt-5 h-[4.5rem] w-full rounded-2xl bg-[#f6b933] text-3xl font-bold text-[#0f0351] disabled:opacity-60 md:h-11 md:rounded-lg md:text-base"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("sign-in");
                setError("");
              }}
              className="mt-4 w-full text-xl font-semibold text-[#0f0351] underline md:text-sm"
            >
              Back to sign in
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmit} className="mt-5 rounded-[28px] bg-white p-7 shadow-2xl md:rounded-2xl md:p-6 md:shadow-md">
            <label className="block text-2xl font-semibold md:text-sm" htmlFor="portal-email">
              Email
            </label>
            <input
              id="portal-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              placeholder="you@email.com"
              required
              className="mt-3 h-[4.5rem] w-full rounded-2xl border-2 border-slate-200 bg-white px-4 text-3xl text-[#0f0351] outline-none placeholder:text-slate-400 focus:border-[#f6b933] md:mt-1.5 md:h-11 md:rounded-lg md:text-base"
            />

            <label className="mt-5 block text-2xl font-semibold md:mt-4 md:text-sm" htmlFor="portal-password">
              Password
            </label>
            <div className="relative mt-3 md:mt-1.5">
              <input
                id="portal-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Password"
                required
                className="h-[4.5rem] w-full rounded-2xl border-2 border-slate-200 bg-white px-4 pr-28 text-3xl text-[#0f0351] outline-none placeholder:text-slate-400 focus:border-[#f6b933] md:h-11 md:rounded-lg md:pr-20 md:text-base"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl px-3 py-2 text-lg font-semibold text-[#0f0351] md:text-sm"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setMode("forgot");
                setError("");
              }}
              className="mt-3 text-lg font-semibold text-[#0f0351] underline md:text-sm"
            >
              Forgot password?
            </button>

            {error ? (
              <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-lg font-medium leading-snug text-rose-700 md:text-sm">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-5 h-[4.5rem] w-full rounded-2xl bg-[#f6b933] text-3xl font-bold text-[#0f0351] disabled:opacity-60 md:mt-4 md:h-11 md:rounded-lg md:text-base"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        {mode === "sign-in" && !standalone && !installed ? (
          <div className="mt-5 rounded-3xl border border-white/20 bg-white/10 p-5 text-white md:hidden">
            <p className="text-xl font-semibold leading-snug">Open {appName} as its own app</p>
            <p className="mt-2 text-lg leading-relaxed text-white/85">
              This page is still inside Chrome. Install it, then launch {appName} from your home screen.
            </p>
            {installEvent ? (
              <button
                type="button"
                onClick={install}
                className="mt-4 h-14 w-full rounded-2xl bg-[#f6b933] text-xl font-bold text-[#0f0351]"
              >
                Install {appName}
              </button>
            ) : (
              <p className="mt-4 text-lg leading-relaxed text-white/90">
                Tap the Chrome menu, then Install app. Open the new home-screen icon after that.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}
