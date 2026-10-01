"use client";

import { FormEvent, useEffect, useState } from "react";

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

export function PortalLogin({ appName, iconSrc, action, redirectTo, blurb }: Props) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [standalone, setStandalone] = useState(true);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setStandalone(inStandaloneApp());
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

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    if (choice.outcome === "accepted") setInstalled(true);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0c0638] px-5 py-8 text-[#0f0351] [padding-bottom:max(2rem,env(safe-area-inset-bottom))] [padding-top:max(2rem,env(safe-area-inset-top))]">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src={iconSrc}
            alt=""
            width={112}
            height={112}
            className="h-28 w-28 rounded-[28px] bg-white shadow-lg"
          />
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-white">{appName}</h1>
          <p className="mt-2 text-lg leading-snug text-white/85">{blurb}</p>
        </div>

        {!standalone && !installed ? (
          <div className="mb-5 rounded-2xl border border-white/20 bg-white/10 p-4 text-white">
            <p className="text-base font-semibold leading-snug">Open {appName} as its own app</p>
            <p className="mt-1 text-sm leading-relaxed text-white/80">
              This page is still inside Chrome. Install it, then launch {appName} from your home screen.
            </p>
            {installEvent ? (
              <button
                type="button"
                onClick={install}
                className="mt-3 h-12 w-full rounded-xl bg-[#f6b933] text-lg font-bold text-[#0f0351]"
              >
                Install {appName}
              </button>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-white/90">
                Tap the Chrome menu, then Install app. Open the new home-screen icon after that.
              </p>
            )}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="rounded-3xl bg-white p-6 shadow-2xl">
          <label className="block text-base font-semibold" htmlFor="portal-email">
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
            className="mt-2 h-14 w-full rounded-xl border-2 border-slate-200 bg-white px-4 text-lg text-[#0f0351] outline-none placeholder:text-slate-400 focus:border-[#f6b933]"
          />

          <label className="mt-5 block text-base font-semibold" htmlFor="portal-password">
            Password
          </label>
          <div className="relative mt-2">
            <input
              id="portal-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Password"
              required
              className="h-14 w-full rounded-xl border-2 border-slate-200 bg-white px-4 pr-24 text-lg text-[#0f0351] outline-none placeholder:text-slate-400 focus:border-[#f6b933]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-2 text-sm font-semibold text-[#0f0351]"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            Use the email and password from your onboarding. Staff testing: admin@wrrapd.com and the
            Command Center password.
          </p>

          {error ? (
            <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-base font-medium leading-snug text-rose-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-5 h-14 w-full rounded-xl bg-[#f6b933] text-lg font-bold text-[#0f0351] disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
