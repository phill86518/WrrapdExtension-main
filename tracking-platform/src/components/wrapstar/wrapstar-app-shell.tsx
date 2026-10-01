"use client";

import { useState, type ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { WrrapdLogo } from "@/components/wrrapd-logo";

export type WrapstarNavSection =
  | "today"
  | "shift"
  | "deliveries"
  | "availability"
  | "earnings"
  | "account"
  | "help";

const NAV: { id: WrapstarNavSection; label: string }[] = [
  { id: "today", label: "Home / Today" },
  { id: "shift", label: "Start Shift" },
  { id: "deliveries", label: "Deliveries" },
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
  /** WrapRider app only — the delivery side. Omit for the WrapStar app (nav item hidden). */
  deliveries?: ReactNode;
  availability: ReactNode;
  earnings: ReactNode;
  account: ReactNode;
  help: ReactNode;
  installCard?: ReactNode;
  /** App branding. */
  appLabel?: "WrapStar" | "JoyRider" | "WrapRider";
  /** Where Log out lands — defaults to the WrapStar app. */
  logoutPath?: string;
  /** Which menu items to show, in order. Defaults to the WrapStar set. */
  sections?: WrapstarNavSection[];
  /** Override a menu label, for example JoyRider "Pickups". */
  sectionLabels?: Partial<Record<WrapstarNavSection, string>>;
};

export function WrapstarAppShell({
  wrapstarName,
  wrapstarId,
  initialSection = "today",
  today,
  shift,
  deliveries,
  availability,
  earnings,
  account,
  help,
  installCard,
  appLabel = "WrapStar",
  logoutPath = "/wrapstar",
  sections,
  sectionLabels,
}: Props) {
  const [section, setSection] = useState<WrapstarNavSection>(initialSection);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const allowed = sections ?? (deliveries === undefined ? NAV.filter((n) => n.id !== "deliveries").map((n) => n.id) : NAV.map((n) => n.id));
  const nav = allowed
    .map((id) => {
      const item = NAV.find((n) => n.id === id);
      if (!item) return null;
      return { id, label: sectionLabels?.[id] ?? item.label };
    })
    .filter((item): item is { id: WrapstarNavSection; label: string } => item !== null);

  function go(id: WrapstarNavSection) {
    setSection(id);
    setDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const body =
    section === "today"
      ? today
      : section === "shift"
        ? shift
        : section === "deliveries"
          ? deliveries ?? today
          : section === "availability"
            ? availability
            : section === "earnings"
              ? earnings
              : section === "account"
                ? account
                : help;

  const title = nav.find((n) => n.id === section)?.label ?? appLabel;

  return (
    <div className="flex h-dvh flex-col bg-[#f4f1ea] text-[#0f0351]">
      {drawerOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(22rem,92vw)] flex-col bg-slate-950 text-white shadow-xl transition-transform duration-200 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!drawerOpen}
      >
        <div className="border-b border-white/10">
          <div className="bg-[#faf8f4] px-5 py-5">
            <WrrapdLogo className="h-14 w-auto max-w-[220px] object-contain object-left" />
          </div>
          <div className="px-5 py-5">
            <p className="text-3xl font-semibold tracking-tight">{appLabel}</p>
            <button
              type="button"
              className="mt-3 text-xl font-semibold text-white/80 underline"
              onClick={() => setDrawerOpen(false)}
            >
              Close menu
            </button>
            <p className="mt-2 truncate text-xl text-slate-200">{wrapstarName}</p>
            <p className="mt-1 font-mono text-base text-slate-400">ID {wrapstarId}</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col justify-evenly overflow-y-auto px-3 py-4">
          {nav.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className={`flex w-full items-center rounded-2xl px-4 py-5 text-left text-xl font-semibold leading-snug ${
                  active ? "bg-[#f6b933] text-[#0f0351]" : "text-white hover:bg-white/10"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="shrink-0 border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <LogoutButton redirectPath={logoutPath} label="Log out" variant="gold" />
        </div>
      </aside>

      <header className="flex shrink-0 items-center gap-3 border-b border-[#0c0638]/10 bg-white px-4 py-4">
        <button
          type="button"
          className="flex h-16 items-center gap-2 rounded-2xl bg-[#f6b933] px-5 text-xl font-bold text-[#0f0351] shadow-sm"
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
          Menu
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-2xl font-bold text-[#0f0351]">{title}</p>
          <p className="truncate text-lg text-[#0f0351]/70">{appLabel}</p>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto my-auto w-full max-w-3xl space-y-6 px-5 py-8 [&_h2]:text-3xl [&_h3]:text-2xl [&_label]:text-xl [&_li]:text-xl [&_p]:text-xl [&_summary]:text-2xl">
          {installCard && section === "today" ? <div>{installCard}</div> : null}
          {body}
        </div>
      </main>

      <nav
        aria-label="Pages"
        className="grid shrink-0 grid-cols-2 gap-2 border-t border-[#0c0638]/10 bg-white px-3 py-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {nav.map((item) => {
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => go(item.id)}
              className={`rounded-2xl px-3 py-4 text-lg font-bold leading-tight ${
                active ? "bg-[#0c0638] text-white" : "bg-[#f4f1ea] text-[#0f0351]"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
