import Link from "next/link";

const LINKS = [
  { href: "/admin", label: "Command Center" },
  { href: "/admin/orders", label: "Orders calendar" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/wrapstars", label: "WrapStars" },
  { href: "/admin/drivers", label: "Drivers" },
  { href: "/admin/finance", label: "Finance" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/pricing", label: "Checkout pricing" },
  { href: "/admin/zip-codes", label: "Allowed ZIP codes" },
] as const;

export function AdminNav({ current }: { current?: string }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3 text-sm">
      {LINKS.map((l) => {
        const active = current === l.href || (l.href !== "/admin" && current?.startsWith(l.href));
        return (
          <Link
            key={l.href}
            href={l.href}
            className={
              active
                ? "rounded-full bg-slate-900 px-3 py-1.5 font-medium text-white"
                : "rounded-full bg-slate-100 px-3 py-1.5 text-slate-700 hover:bg-slate-200"
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
