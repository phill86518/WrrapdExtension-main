import Link from "next/link";
import { SameOriginLogoutLink } from "@/components/same-origin-logout-link";
import { PasswordField } from "@/components/password-field";
import { WrrapdLogo } from "@/components/wrrapd-logo";
import { getSession } from "@/lib/auth";
import { adminAccountsEnrolled } from "@/lib/admin-accounts";
import { listAllocationQueue, listOrdersByStatus } from "@/lib/data";
import { ensureDemoStaffing } from "@/lib/demo-staffing";
import { safeAdminNextPath } from "@/lib/url";

export const dynamic = "force-dynamic";

function pickSearchParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
  return undefined;
}

const MODULE_GROUPS = [
  {
    title: "Today",
    blurb: "Messages, gifts in motion, and who is working.",
    modules: [
      {
        href: "/admin/service",
        title: "Customer service",
        body: "Texts, photos, and calls on the Wrrapd number.",
      },
      {
        href: "/admin/orders",
        title: "Orders",
        body: "Active, scheduled, delinquent, and past gifts.",
      },
      {
        href: "/admin/orders/calendar",
        title: "Calendar",
        body: "Every order by Eastern calendar day.",
      },
      {
        href: "/admin/inventory",
        title: "Daily inventory",
        body: "Wrapping paper, cardboard boxes, and tissue for each WrapStar and WrapRider.",
      },
      {
        href: "/admin/allocations",
        title: "Allocations",
        body: "Approve a nearby match, or assign a WrapStar and JoyRider by hand.",
      },
      {
        href: "/admin/availability",
        title: "Availability",
        body: "Who can wrap or deliver this week.",
      },
      {
        href: "/admin/wrap-work",
        title: "Wrap hours",
        body: "Clock-in, gifts wrapped, and the codes on each box.",
      },
    ],
  },
  {
    title: "People",
    blurb: "Hire first, then open the roster for that role.",
    modules: [
      {
        href: "/admin/applications",
        title: "Applications",
        body: "Review, interview, and activate WrapStar, JoyRider, and WrapRider applicants.",
      },
      {
        href: "/admin/wrapstars",
        title: "WrapStars",
        body: "People who wrap the gift.",
      },
      {
        href: "/admin/drivers",
        title: "JoyRiders",
        body: "People who deliver the wrapped gift.",
      },
      {
        href: "/admin/wrapriders",
        title: "WrapRiders",
        body: "People who wrap and deliver the same gift.",
      },
    ],
  },
  {
    title: "Money",
    blurb: "What we owe, and how the day went.",
    modules: [
      {
        href: "/admin/finance",
        title: "Finance & payouts",
        body: "Hourly rates, wallets, and the payout export.",
      },
      {
        href: "/admin/reports",
        title: "Delivery reports",
        body: "Daily numbers and a CSV export.",
      },
    ],
  },
  {
    title: "Setup",
    blurb: "Rules that checkout and assignment already use.",
    modules: [
      {
        href: "/admin/pricing",
        title: "Checkout pricing",
        body: "What the shopper is charged.",
      },
      {
        href: "/admin/zip-codes",
        title: "Allowed ZIP codes",
        body: "Where we accept a gift.",
      },
      {
        href: "/admin/printer-coverage",
        title: "Custom-design coverage",
        body: "Who can print a custom wrap.",
      },
    ],
  },
] as const;

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = searchParams ? await searchParams : {};
  const query = { error: pickSearchParam(raw.error) };
  const nextPath = safeAdminNextPath(pickSearchParam(raw.next));
  const session = await getSession();

  if (!session || session.role !== "admin") {
    const enrolled = await adminAccountsEnrolled().catch(() => false);
    return (
      <main className="mx-auto min-h-screen max-w-xl px-4 py-16">
        <WrrapdLogo className="h-10 w-auto max-w-[180px] object-contain object-left" />
        <h1 className="mt-4 text-3xl font-semibold">Admin Login</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to the command center.</p>
        {nextPath ? (
          <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Your session ended. Sign in again to return to the page you were on.
          </p>
        ) : null}
        {query.error === "1" && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {enrolled ? "Email, password, or code is incorrect." : "Incorrect admin password."}
          </p>
        )}
        {query.error === "locked" && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Too many tries. Wait 15 minutes and try again.
          </p>
        )}
        <form action="/api/admin/login" method="post" className="mt-6 space-y-4 rounded-lg border p-6">
          {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
          {enrolled ? (
            <input
              name="email"
              type="email"
              required
              placeholder="Email"
              autoComplete="username"
              className="w-full rounded border px-3 py-2"
            />
          ) : null}
          <PasswordField name="password" placeholder={enrolled ? "Password" : "Admin password"} autoComplete="current-password" />
          {enrolled ? (
            <input
              name="code"
              required
              inputMode="numeric"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              placeholder="6-digit code from your authenticator app"
              autoComplete="one-time-code"
              className="w-full rounded border px-3 py-2"
            />
          ) : null}
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
  let allocationCount = 0;
  try {
    await ensureDemoStaffing();
    const [active, scheduled, delinquent, allocationQueue] = await Promise.all([
      listOrdersByStatus("active"),
      listOrdersByStatus("scheduled"),
      listOrdersByStatus("delinquent"),
      listAllocationQueue(),
    ]);
    activeCount = active.length;
    scheduledCount = scheduled.length;
    delinquentCount = delinquent.length;
    allocationCount = allocationQueue.length;
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

  const adminEnrolled = await adminAccountsEnrolled().catch(() => false);

  return (
    <div className="space-y-8">
      {!adminEnrolled ? (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 text-amber-950">
          <p className="font-semibold">Command Center still uses the shared password.</p>
          <p className="mt-1 text-sm">
            Set up your personal login with an authenticator code. After the first one is saved, the shared
            password stops working here.
          </p>
          <Link href="/admin/security" className="mt-3 inline-block rounded-lg bg-[#0f172a] px-4 py-2 text-sm font-bold text-white">
            Set up admin login
          </Link>
        </div>
      ) : null}
      <div className="rounded-2xl border-2 border-[#1a2744]/40 bg-[#faf8f4] p-6 shadow-xl shadow-[#0f172a]/20 ring-1 ring-white/40">
        <WrrapdLogo className="h-10 w-auto max-w-[180px] object-contain object-left" />
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#0f172a]">WrapStars Command Center</h1>
        <p className="mt-1 text-sm font-medium text-[#2d4a38]">
          Start with Today. People is hiring and rosters. Money is payouts. Setup is checkout rules.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/admin/allocations"
            className="inline-flex items-center rounded-xl bg-gradient-to-b from-[#1a2744] to-[#0f172a] px-4 py-2.5 text-sm font-bold text-white shadow-md"
          >
            Allocations · {allocationCount} waiting
          </Link>
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

      <section className="rounded-2xl border border-[#1a2744]/25 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-[#1a2744]">Portal test logins</h2>
        <p className="mt-2 text-sm text-[#2d4a38]">
          Same email on every app: <strong>admin@wrrapd.com</strong>. Password is the shared admin
          password (APP_ADMIN_PASSWORD), not your personal Command Center login. Saving an email on a roster row does not create a login.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-[#0f172a]">
          <li>
            <a className="font-semibold text-blue-800 underline" href="https://wrapstar.wrrapd.com">
              wrapstar.wrrapd.com
            </a>{" "}
            — opens as Roger
          </li>
          <li>
            <a className="font-semibold text-blue-800 underline" href="https://joyrider.wrrapd.com">
              joyrider.wrrapd.com
            </a>{" "}
            — opens as Devon Blake
          </li>
          <li>
            <a className="font-semibold text-blue-800 underline" href="https://wraprider.wrrapd.com">
              wraprider.wrrapd.com
            </a>{" "}
            — opens as Alex Rivera
          </li>
        </ul>
      </section>

      {MODULE_GROUPS.map((group) => (
        <section key={group.title} className="space-y-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#1a2744]">{group.title}</h2>
            <p className="mt-1 text-sm text-[#2d4a38]">{group.blurb}</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {group.modules.map((mod) => (
              <Link
                key={mod.href}
                href={mod.href}
                className="group relative overflow-hidden rounded-2xl border-2 border-[#1a2744]/35 bg-[#faf8f4] p-6 shadow-lg shadow-[#0f172a]/15 transition hover:border-[#c9a227] hover:shadow-xl"
              >
                <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#c9a227] via-amber-500 to-[#c9a227]" />
                <h3 className="mt-2 font-bold text-[#0f172a]">{mod.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#2d4a38]">{mod.body}</p>
                {mod.href === "/admin/allocations" && allocationCount > 0 ? (
                  <p className="mt-3 text-xs font-bold uppercase tracking-wide text-amber-800">
                    {allocationCount} waiting for approval
                  </p>
                ) : null}
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
          </div>
        </section>
      ))}
    </div>
  );
}
