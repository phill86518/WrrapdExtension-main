"use client";

import { useState, type ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { WrrapdLogo } from "@/components/wrrapd-logo";

export type WrapstarNavSection =
  | "today"
  | "shift"
  | "availability"
  | "earnings"
  | "account"
  | "help";

const NAV: { id: WrapstarNavSection; label: string }[] = [
  { id: "today", label: "Home / Today" },
  { id: "shift", label: "Start Shift" },
  { id: "availability", label: "Availability" },
  { id: "earnings", label: "Earnings" },
  { id: "account", label: "Account" },
  { id: "help", label: "Help" },
];

type Props = {
  wrapstarName: string;
  wrapstarId: string;
  initialSection?: WrapstarNavSection;
  today: ReactNode;
  shift: ReactNode;
  availability: ReactNode;
  earnings: ReactNode;
  account: ReactNode;
  help: ReactNode;
  installCard?: ReactNode;
};

export function WrapstarAppShell({
  wrapstarName,
  wrapstarId,
  initialSection = "today",
  today,
  shift,
  availability,
  earnings,
  account,
  help,
  installCard,
}: Props) {
  const [section, setSection] = useState<WrapstarNavSection>(initialSection);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function go(id: WrapstarNavSection) {
    setSection(id);
    setDrawerOpen(false);
  }

  const body =
    section === "today"
      ? today
      : section === "shift"
        ? shift
        : section === "availability"
          ? availability
          : section === "earnings"
            ? earnings
            : section === "account"
              ? account
              : help;

  const title = NAV.find((n) => n.id === section)?.label ?? "WrapStar";

  return (
    <div className="relative min-h-screen bg-slate-50">
      {drawerOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,86vw)] flex-col bg-slate-950 text-white shadow-xl transition-transform duration-200 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!drawerOpen}
      >
        <div className="border-b border-white/10 px-4 py-5">
          <WrrapdLogo className="h-10 w-auto max-w-[180px] brightness-0 invert" />
          <p className="mt-3 text-lg font-semibold tracking-tight">WrapStar</p>
          <p className="mt-0.5 truncate text-sm text-slate-300">{wrapstarName}</p>
          <p className="mt-1 font-mono text-[11px] text-slate-500">ID {wrapstarId}</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className={`mb-1 flex w-full items-center rounded-lg px-3 py-3 text-left text-sm font-medium ${
                  active
                    ? "bg-amber-500 text-slate-950"
                    : "text-slate-100 hover:bg-white/10"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <LogoutButton redirectPath="/wrapstar" />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur">
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-900 shadow-sm"
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
        >
          <span className="sr-only">Menu</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-slate-900">{title}</p>
          <p className="truncate text-xs text-slate-500">WrapStar App</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4 pb-16">
        {installCard && section === "today" ? <div className="mb-4">{installCard}</div> : null}
        {body}
      </main>
    </div>
  );
}
