"use client";

import { useId, useState } from "react";

type Props = {
  name: string;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
};

export function PasswordField({ name, placeholder, autoComplete = "current-password", className = "" }: Props) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        type={visible ? "text" : "password"}
        name={name}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="w-full rounded border border-slate-300 bg-white py-2 pl-3 pr-11 text-slate-900 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
        required
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.35" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}
