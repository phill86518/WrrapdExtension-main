export type AdminNavMatch = "exact" | "prefix";

export type AdminNavLink = {
  href: string;
  label: string;
  match: AdminNavMatch;
};

export type AdminNavGroup = {
  label: string;
  links: readonly AdminNavLink[];
};

/** Sidebar and home page share this order. Home is the hub; the rest follows the day's work. */
export const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = [
  {
    label: "Today",
    links: [
      { href: "/admin", label: "Home", match: "exact" },
      { href: "/admin/service", label: "Customer service", match: "prefix" },
      { href: "/admin/orders", label: "Orders", match: "prefix" },
      { href: "/admin/orders/calendar", label: "Calendar", match: "prefix" },
      { href: "/admin/allocations", label: "Allocations", match: "prefix" },
      { href: "/admin/availability", label: "Availability", match: "prefix" },
    ],
  },
  {
    label: "People",
    links: [
      { href: "/admin/applications", label: "Applications", match: "prefix" },
      { href: "/admin/wrapstars", label: "WrapStars", match: "prefix" },
      { href: "/admin/drivers", label: "JoyRiders", match: "prefix" },
      { href: "/admin/wrapriders", label: "WrapRiders", match: "prefix" },
    ],
  },
  {
    label: "Money",
    links: [
      { href: "/admin/finance", label: "Finance", match: "prefix" },
      { href: "/admin/reports", label: "Reports", match: "prefix" },
    ],
  },
  {
    label: "Setup",
    links: [
      { href: "/admin/pricing", label: "Checkout pricing", match: "prefix" },
      { href: "/admin/zip-codes", label: "Allowed ZIP codes", match: "prefix" },
      { href: "/admin/printer-coverage", label: "Custom-design coverage", match: "prefix" },
    ],
  },
] as const;

export function isAdminNavActive(pathname: string, href: string, match: AdminNavMatch): boolean {
  if (match === "exact") return pathname === href;
  if (href === "/admin/orders") {
    return (
      pathname === "/admin/orders" ||
      (pathname.startsWith("/admin/orders/") && !pathname.startsWith("/admin/orders/calendar"))
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
