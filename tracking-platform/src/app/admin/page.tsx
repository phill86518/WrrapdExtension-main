import Link from "next/link";
import { SameOriginLogoutLink } from "@/components/same-origin-logout-link";
import { PasswordField } from "@/components/password-field";
import { WrrapdLogo } from "@/components/wrrapd-logo";
import { getSession } from "@/lib/auth";
import { listOrdersByStatus } from "@/lib/data";
import { ensureDemoStaffing } from "@/lib/demo-staffing";

export const dynamic = "force-dynamic";

function pickSearchParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
  return undefined;
}

const MODULES = [
  {
    href: "/admin/orders",
    title: "Orders",
    body: "Active, scheduled, delinquent, and past boards — WrapStar + Driver assignment.",
  },
  {
    href: "/admin/orders/calendar",
    title: "Orders calendar",
    body: "Browse every order by Eastern calendar day.",
  },
  {
    href: "/admin/applications",
    title: "Applications",
    body: "Review, interview, approve, and activate WrapStar applicants.",
  },
  {
    href: "/admin/wrapstars",
    title: "WrapStars",
    body: "Gift-wrappers (IDs start with 8). Demo: Roger 8260981201, Taylor 8260965201.",
  },
  {
    href: "/admin/drivers",
    title: "Drivers",
    body: "Couriers (IDs start with 7). Demo: Devon 7260981201, Morgan 7261090301. App: /courier",
  },
  {
    href: "/admin/finance",
    title: "Finance & payouts",
    body: "Earnings ledger, wallets, ACH CSV export, and pay rates.",
  },
  {
    href: "/admin/reports",
    title: "Delivery reports",
    body: "View daily metrics and export CSV for operations.",
  },
  {
    href: "/admin/pricing",
    title: "Checkout pricing",
    body: "Commercial and geo pricing rules for checkout.",
  },
  {
    href: "/admin/zip-codes",
    title: "Allowed ZIP codes",
    body: "Service-area allowlist for intake and allocation.",
  },
] as const;

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = searchParams ? await searchParams : {};
  const query = { error: pickSearchParam(raw.error) };
  const session = await getSession();

  if (!session || session.role !== "admin") {
    return (
      <main className="mx-auto min-h-screen max-w-xl px-4 py-16">
        <WrrapdLogo className="h-10 w-auto max-w-[180px] object-contain object-left" />
        <h1 className="mt-4 text-3xl font-semibold">Admin Login</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to the command center.</p>
        {query.error === "1" && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Incorrect admin password. It must match{" "}
            <code className="rounded bg-red-100 px-1">APP_ADMIN_PASSWORD</code> on Cloud Run.
          </p>
        )}
        <p className="mt-3 text-sm text-slate-500">
          Sign in with the <strong>admin</strong> password from{" "}
          <code className="rounded bg-slate-100 px-1">APP_ADMIN_PASSWORD</code> (default{" "}
          <code className="rounded bg-slate-100 px-1">admin123</code> if unset).
        </p>
        <form action="/api/admin/login" method="post" className="mt-6 space-y-4 rounded-lg border p-6">
          <PasswordField name="password" placeholder="Admin password" autoComplete="current-password" />
          <button className="rounded bg-black px-4 py-2 text-white" type="submit">
            Sign in
          </button>
        </form>
      </main>
    );
  }

  let delinquentCount = 0;
  let activeCount = 0;
  let scheduledCount = 0;
  try {
    await ensureDemoStaffing();
    const [active, scheduled, delinquent] = await Promise.all([
      listOrdersByStatus("active"),
      listOrdersByStatus("scheduled"),
      listOrdersByStatus("delinquent"),
    ]);
    activeCount = active.length;
    scheduledCount = scheduled.length;
    delinquentCount = delinquent.length;
  } catch (err) {
    console.error("[admin] hub stats failed", err);
    return (
      <div className="rounded-2xl border-2 border-rose-300 bg-[#faf8f4] p-6 shadow-xl">
        <h1 className="text-2xl font-semibold">Command center unavailable</h1>
        <p className="mt-3 text-slate-700">
          Loading order stats failed. Check Cloud Run logs for{" "}
          <code className="rounded bg-slate-100 px-1 text-sm">[admin]</code>.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          <SameOriginLogoutLink redirectPath="/admin" className="text-blue-700 underline">
            Log out
          </SameOriginLogoutLink>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border-2 border-[#1a2744]/40 bg-[#faf8f4] p-6 shadow-xl shadow-[#0f172a]/20 ring-1 ring-white/40">
        <WrrapdLogo className="h-10 w-auto max-w-[180px] object-contain object-left" />
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#0f172a]">WrapStars Command Center</h1>
        <p className="mt-1 text-sm font-medium text-[#2d4a38]">
          Module hub — open Orders for boards, Applications for hiring, and the left rail for everything else.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/admin/orders"
            className="inline-flex items-center rounded-xl bg-gradient-to-b from-[#c9a227] to-[#a88417] px-4 py-2.5 text-sm font-bold text-[#1a1a12] shadow-md"
          >
            Open Orders · {activeCount} active · {scheduledCount} scheduled
          </Link>
          {delinquentCount > 0 ? (
            <Link
              href="/admin/orders"
              className="inline-flex items-center rounded-xl bg-gradient-to-b from-rose-600 to-rose-800 px-4 py-2.5 text-sm font-bold text-white shadow-md"
            >
              {delinquentCount} delinquent →
            </Link>
          ) : (
            <span className="inline-flex items-center rounded-xl border border-[#1a2744]/25 bg-white px-4 py-2.5 text-sm font-semibold text-[#2d4a38]">
              No delinquent orders
            </span>
          )}
        </div>
      </div>

      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {MODULES.map((mod) => (
          <Link
            key={mod.href}
            href={mod.href}
            className="group relative overflow-hidden rounded-2xl border-2 border-[#1a2744]/35 bg-[#faf8f4] p-6 shadow-lg shadow-[#0f172a]/15 transition hover:border-[#c9a227] hover:shadow-xl"
          >
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#c9a227] via-amber-500 to-[#c9a227]" />
            <h3 className="mt-2 font-bold text-[#0f172a]">{mod.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#2d4a38]">{mod.body}</p>
            {mod.href === "/admin/orders" && delinquentCount > 0 ? (
              <p className="mt-3 text-xs font-bold uppercase tracking-wide text-rose-700">
                {delinquentCount} delinquent need attention
              </p>
            ) : null}
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[#1a2744] group-hover:text-amber-700">
              Open →
            </p>
          </Link>
        ))}
      </section>
    </div>
  );
}
