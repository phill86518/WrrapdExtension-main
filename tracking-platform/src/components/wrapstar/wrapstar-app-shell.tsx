"use client";

import { useState, type ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { WrrapdLogo } from "@/components/wrrapd-logo";

export type WrapstarNavSection =
  | "today"
  | "inventory"
  | "shift"
  | "deliveries"
  | "availability"
  | "earnings"
  | "account"
  | "help";

const NAV: { id: WrapstarNavSection; label: string }[] = [
  { id: "today", label: "Home / Today" },
  { id: "inventory", label: "Inventory" },
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
  inventory?: ReactNode;
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
  inventory,
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
  const allowed =
    sections ??
    NAV.filter((item) => {
      if (item.id === "deliveries" && deliveries === undefined) return false;
      if (item.id === "inventory" && inventory === undefined) return false;
      return true;
    }).map((item) => item.id);
  const nav = allowed
    .map((id) => {
      const item = NAV.find((n) => n.id === id);
      if (!item) return null;
      return { id, label: sectionLabels?.[id] ?? item.label };
    })
    .filter((item): item is { id: WrapstarNavSection; label: string } => item !== null);

  function go(id: WrapstarNavSection) {
    setSection(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const body =
    section === "today"
      ? today
      : section === "inventory"
        ? inventory ?? today
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
    <div className="min-h-dvh bg-[#f4f1ea] text-[#0f0351] md:flex">
      <aside className="border-b border-white/10 bg-slate-950 text-white md:sticky md:top-0 md:flex md:max-h-dvh md:w-60 md:shrink-0 md:flex-col md:self-start md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="flex items-center gap-3 bg-[#faf8f4] px-4 py-3 text-[#0f0351] md:block md:px-4 md:py-4">
          <WrrapdLogo className="h-9 w-auto max-w-[140px] object-contain object-left md:h-10 md:max-w-[180px]" />
          <div className="min-w-0 md:mt-3">
            <p className="truncate text-base font-semibold md:text-lg">{appLabel}</p>
            <p className="truncate text-sm text-[#0f0351]/70 md:text-slate-600">{wrapstarName}</p>
          </div>
        </div>
        <nav aria-label="Pages" className="grid grid-cols-2 gap-2 p-3 md:flex md:flex-col md:gap-1">
          {nav.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className={`rounded-xl px-3 py-3 text-left text-sm font-semibold leading-snug md:rounded-lg md:px-3 md:py-2 md:text-sm ${
                  active ? "bg-[#f6b933] text-[#0f0351]" : "bg-white/10 text-white hover:bg-white/15 md:bg-transparent"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:border-t md:border-white/10 md:p-3">
          <LogoutButton
            redirectPath={logoutPath}
            label="Log out"
            variant="gold"
            className="!h-11 !px-3 !text-sm md:!h-10"
          />
        </div>
      </aside>

      <div className="min-w-0 md:flex-1">
        <header className="border-b border-[#0c0638]/10 bg-white px-4 py-3 md:px-6 md:py-4">
          <h1 className="truncate text-lg font-semibold text-[#0f0351] md:text-xl">{title}</h1>
          <p className="truncate text-sm text-[#0f0351]/60">{appLabel}</p>
        </header>
        <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 pb-10 md:space-y-5 md:px-6 md:py-6">
          {installCard && section === "today" ? <div>{installCard}</div> : null}
          {body}
        </main>
      </div>
    </div>
  );
}
