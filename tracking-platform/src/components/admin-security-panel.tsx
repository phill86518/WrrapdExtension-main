"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Row = { email: string; name: string; disabled: boolean; lastLoginAt: string | null; createdAt: string };

export function AdminSecurityPanel({ admins, currentUserId }: { admins: Row[]; currentUserId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<{ token: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(payload: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      return data;
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#1a2744]/25 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-[#0f172a]">Admin logins</h2>
        {admins.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">None yet. The shared password still works until you add one.</p>
        ) : (
          <ul className="mt-3 divide-y text-sm">
            {admins.map((a) => (
              <li key={a.email} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <strong>{a.name}</strong> · {a.email}
                  {a.disabled ? <span className="ml-2 text-rose-700">(turned off)</span> : null}
                  <span className="ml-2 text-slate-500">
                    {a.lastLoginAt ? `last sign-in ${new Date(a.lastLoginAt).toLocaleString()}` : "never signed in"}
                  </span>
                </span>
                {currentUserId !== `admin:${a.email}` ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded border px-3 py-1 text-xs font-semibold"
                    onClick={async () => {
                      if (await call({ action: a.disabled ? "enable" : "disable", email: a.email })) router.refresh();
                    }}
                  >
                    {a.disabled ? "Turn on" : "Turn off"}
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">you</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-[#1a2744]/25 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-[#0f172a]">Add an admin login</h2>
        <p className="mt-1 text-sm text-slate-600">
          The person needs an authenticator app on their phone (Google Authenticator, Microsoft Authenticator, 1Password,
          Authy).
        </p>
        {!setup ? (
          <form
            className="mt-4 grid max-w-md gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const data = await call({ action: "start", name, email, password });
              if (data) setSetup(data);
            }}
          >
            <input className="rounded border px-3 py-2" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <input
              className="rounded border px-3 py-2"
              type="email"
              placeholder="Email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="rounded border px-3 py-2"
              type="password"
              placeholder="Password (12+ characters)"
              autoComplete="new-password"
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" disabled={busy} className="rounded bg-[#0f172a] px-4 py-2 font-bold text-white">
              Next: scan code
            </button>
          </form>
        ) : (
          <form
            className="mt-4 grid max-w-md gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const data = await call({ action: "confirm", token: setup.token, code });
              if (data) {
                setSetup(null);
                setName("");
                setEmail("");
                setPassword("");
                setCode("");
                setMsg({ ok: true, text: "Saved. Sign in with email, password, and the code from now on." });
                router.refresh();
              }
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="Authenticator QR code" width={240} height={240} className="rounded border" />
            <p className="text-xs text-slate-600">
              Can&apos;t scan? Enter this key: <code className="break-all">{setup.secret}</code>
            </p>
            <input
              className="rounded border px-3 py-2"
              inputMode="numeric"
              placeholder="6-digit code from the app"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="rounded bg-[#0f172a] px-4 py-2 font-bold text-white">
                Save login
              </button>
              <button type="button" className="rounded border px-4 py-2" onClick={() => setSetup(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
        {msg ? <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p> : null}
      </section>
    </div>
  );
}
