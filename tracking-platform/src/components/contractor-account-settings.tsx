"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Contact = {
  nickname?: string;
  phoneMobile?: string;
  phoneWork?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

type Props = {
  email: string;
  contact: Contact;
};

const INPUT = "w-full rounded border border-slate-300 px-3 py-2 text-sm";

/**
 * In-app account settings for active contractors: contact details + password.
 * (The onboarding site is closed to them after activation, so this is the only place to edit.)
 */
export function ContractorAccountSettings({ email, contact }: Props) {
  const router = useRouter();
  const [panel, setPanel] = useState<"none" | "contact" | "password">("none");

  const [form, setForm] = useState<Contact>({
    nickname: contact.nickname || "",
    phoneMobile: contact.phoneMobile || "",
    phoneWork: contact.phoneWork || "",
    addressLine1: contact.addressLine1 || "",
    addressLine2: contact.addressLine2 || "",
    city: contact.city || "",
    state: contact.state || "",
    postalCode: contact.postalCode || "",
  });
  const [contactMsg, setContactMsg] = useState("");
  const [contactErr, setContactErr] = useState("");
  const [savingContact, setSavingContact] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  async function saveContact(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setContactMsg("");
    setContactErr("");
    setSavingContact(true);
    const r = await fetch("/api/contractor/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify(form),
    });
    const data = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSavingContact(false);
    if (!r.ok || !data.ok) {
      setContactErr(data.error || "Could not save. Please try again.");
      return;
    }
    setContactMsg("Saved.");
    router.refresh();
  }

  async function savePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPwMsg("");
    setPwErr("");
    if (newPassword !== confirmPassword) {
      setPwErr("New password and confirmation do not match.");
      return;
    }
    setSavingPw(true);
    const r = await fetch("/api/contractor/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
    const data = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSavingPw(false);
    if (!r.ok || !data.ok) {
      setPwErr(data.error || "Could not change password. Please try again.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPwMsg("Password changed.");
  }

  const toggle = (next: "contact" | "password") => {
    setPanel((p) => (p === next ? "none" : next));
    setContactMsg("");
    setContactErr("");
    setPwMsg("");
    setPwErr("");
  };

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => toggle("contact")}
          className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100"
        >
          {panel === "contact" ? "Close" : "Edit contact details"}
        </button>
        <button
          type="button"
          onClick={() => toggle("password")}
          className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100"
        >
          {panel === "password" ? "Close" : "Change password"}
        </button>
      </div>

      {panel === "contact" ? (
        <form onSubmit={saveContact} className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-slate-600 sm:col-span-2">
            Email (sign-in)
            <input className={`${INPUT} mt-1 bg-slate-50`} value={email} readOnly />
            <span className="mt-1 block text-[11px] text-slate-500">
              To change your email, contact Wrrapd support.
            </span>
          </label>
          <label className="text-xs text-slate-600">
            Preferred name
            <input
              className={`${INPUT} mt-1`}
              value={form.nickname}
              onChange={(e) => setForm({ ...form, nickname: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-600">
            Mobile phone
            <input
              className={`${INPUT} mt-1`}
              value={form.phoneMobile}
              onChange={(e) => setForm({ ...form, phoneMobile: e.target.value })}
              inputMode="tel"
            />
          </label>
          <label className="text-xs text-slate-600 sm:col-span-2">
            Address line 1
            <input
              className={`${INPUT} mt-1`}
              value={form.addressLine1}
              onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-600 sm:col-span-2">
            Address line 2
            <input
              className={`${INPUT} mt-1`}
              value={form.addressLine2}
              onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-600">
            City
            <input
              className={`${INPUT} mt-1`}
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-600">
              State
              <input
                className={`${INPUT} mt-1 uppercase`}
                value={form.state}
                maxLength={2}
                onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
              />
            </label>
            <label className="text-xs text-slate-600">
              ZIP
              <input
                className={`${INPUT} mt-1`}
                value={form.postalCode}
                onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                inputMode="numeric"
              />
            </label>
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={savingContact}
              className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {savingContact ? "Saving…" : "Save"}
            </button>
            {contactMsg ? <span className="ml-3 text-sm text-emerald-700">{contactMsg}</span> : null}
            {contactErr ? <span className="ml-3 text-sm text-rose-700">{contactErr}</span> : null}
          </div>
        </form>
      ) : null}

      {panel === "password" ? (
        <form onSubmit={savePassword} className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            type="password"
            placeholder="Current password"
            className={INPUT}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <input
            type="password"
            placeholder="New password (10+ characters)"
            className={INPUT}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={10}
            required
          />
          <input
            type="password"
            placeholder="Confirm new password"
            className={INPUT}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={10}
            required
          />
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={savingPw}
              className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {savingPw ? "Saving…" : "Change password"}
            </button>
            {pwMsg ? <span className="ml-3 text-sm text-emerald-700">{pwMsg}</span> : null}
            {pwErr ? <span className="ml-3 text-sm text-rose-700">{pwErr}</span> : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
