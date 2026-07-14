export const ADMIN_NAV_LINKS = [
  { href: "/admin", label: "Command Center", match: "exact" as const },
  { href: "/admin/orders", label: "Orders", match: "prefix" as const },
  { href: "/admin/applications", label: "Applications", match: "prefix" as const },
  { href: "/admin/wrapstars", label: "WrapStars", match: "prefix" as const },
  { href: "/admin/drivers", label: "Drivers", match: "prefix" as const },
  { href: "/admin/finance", label: "Finance", match: "prefix" as const },
  { href: "/admin/reports", label: "Reports", match: "prefix" as const },
  { href: "/admin/pricing", label: "Checkout pricing", match: "prefix" as const },
  { href: "/admin/zip-codes", label: "Allowed ZIP codes", match: "prefix" as const },
] as const;

export function isAdminNavActive(pathname: string, href: string, match: "exact" | "prefix"): boolean {
  if (match === "exact") return pathname === href;
  if (href === "/admin/orders") {
    return pathname === "/admin/orders" || pathname.startsWith("/admin/orders/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
