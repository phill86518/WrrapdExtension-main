"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ADMIN_NAV_LINKS, isAdminNavActive } from "@/components/admin-nav";
import { LogoutButton } from "@/components/logout-button";
import { WrrapdLogo } from "@/components/wrrapd-logo";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/admin";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#9aab9f] via-[#c5cfc9] to-[#a8b8ae]">
      <div className="flex min-h-screen">
        <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b-2 border-[#1a2744]/40 bg-[#0f172a] px-4 py-3 shadow-lg lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white"
            aria-label="Open navigation"
          >
            Menu
          </button>
          <span className="text-sm font-bold tracking-wide text-white">WrapStars Ops</span>
          <LogoutButton redirectPath="/admin" />
        </header>

        {open ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-[#0f172a]/50 lg:hidden"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
        ) : null}

        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r-2 border-[#1a2744]/50 bg-[#0f172a] shadow-2xl transition-transform duration-200 lg:static lg:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="border-b border-white/10 bg-[#faf8f4] px-5 py-5">
            <Link href="/admin" className="block" onClick={() => setOpen(false)}>
              <WrrapdLogo className="h-9 w-auto max-w-[160px] object-contain object-left" />
              <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#1a2744]">
                Command Center
              </p>
            </Link>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Admin modules">
            {ADMIN_NAV_LINKS.map((link) => {
              const active = isAdminNavActive(pathname, link.href, link.match);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={
                    active
                      ? "block rounded-xl bg-gradient-to-r from-[#c9a227] to-[#a88417] px-3 py-2.5 text-sm font-bold text-[#1a1a12] shadow-md"
                      : "block rounded-xl px-3 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden border-t border-white/10 p-4 lg:block">
            <LogoutButton redirectPath="/admin" />
          </div>
        </aside>

        <div className="min-w-0 flex-1 pt-[57px] lg:pt-0">
          <div className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
