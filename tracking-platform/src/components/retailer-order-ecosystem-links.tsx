import Link from "next/link";

const linkClass =
  "rounded-lg border border-[#1a2744]/40 bg-white px-3 py-2 text-sm font-semibold text-[#0f172a] hover:border-[#c9a227]";

/** Cross-links for the Retailer orders hub (list + detail). */
export function RetailerOrderEcosystemLinks(props?: { retailerOrderNumber?: string }) {
  const q = props?.retailerOrderNumber?.trim();
  const purchasesHref = q
    ? `/admin/buy-for-you/purchases?q=${encodeURIComponent(q)}`
    : "/admin/buy-for-you/purchases";
  const intakeHref = q ? `/admin/intake?q=${encodeURIComponent(q)}` : "/admin/intake";

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Related Command Center sections">
      <Link href="/admin/orders" className={linkClass}>
        Orders
      </Link>
      <Link href={intakeHref} className={linkClass}>
        Hub intake
      </Link>
      <Link href="/admin/buy-for-you" className={linkClass}>
        Place queue
      </Link>
      <Link href={purchasesHref} className={linkClass}>
        Items we purchased
      </Link>
    </nav>
  );
}
