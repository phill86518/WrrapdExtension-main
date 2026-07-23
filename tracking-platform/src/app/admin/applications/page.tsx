import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listWrapstarApplications } from "@/lib/wrapstar-applications-admin";
import { listDriverApplications } from "@/lib/driver-applications-admin";

export const dynamic = "force-dynamic";

function pick(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

const ROLE_FILTERS = [
  { id: "all", label: "All roles" },
  { id: "wrapstar", label: "WrapStars" },
  { id: "driver", label: "Drivers" },
] as const;

const FILTERS = [
  { id: "all", label: "All" },
  { id: "under_review", label: "Under review" },
  { id: "interview", label: "Interview" },
  { id: "approved", label: "Approved (onboarding)" },
  { id: "declined", label: "Declined offer" },
  { id: "active", label: "Active" },
  { id: "rejected", label: "Rejected" },
] as const;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    under_review: "bg-amber-100 text-amber-900",
    interview: "bg-sky-100 text-sky-900",
    approved: "bg-indigo-100 text-indigo-900",
    declined: "bg-orange-100 text-orange-900",
    active: "bg-emerald-100 text-emerald-900",
    rejected: "bg-rose-100 text-rose-900",
  };
  return map[status] || "bg-slate-100 text-slate-700";
}

type Row = {
  id: number;
  role: "wrapstar" | "driver";
  fullName: string;
  email: string;
  city: string;
  state: string;
  postalCode: string;
  status: string;
  submittedAt: string;
  createdAt: string;
  fitScore?: number;
  canDeliver?: string;
  vehicleType?: string;
};

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();

  const sp = await searchParams;
  const status = pick(sp.status) || "all";
  const role = pick(sp.role) || "all";
  const q = (pick(sp.q) || "").trim();

  let apps: Row[] = [];
  let error: string | null = null;
  try {
    const statusArg = status === "all" ? undefined : status;
    const qArg = q || undefined;
    const wantWs = role === "all" || role === "wrapstar";
    const wantDrv = role === "all" || role === "driver";

    const [ws, drv] = await Promise.all([
      wantWs
        ? listWrapstarApplications(statusArg, qArg).catch((e) => {
            if (!wantDrv) throw e;
            return [] as Awaited<ReturnType<typeof listWrapstarApplications>>;
          })
        : Promise.resolve([]),
      wantDrv
        ? listDriverApplications(statusArg, qArg).catch((e) => {
            // Driver routes may not be deployed yet — don't blank WrapStars.
            if (!wantWs) throw e;
            console.error("Driver applications load failed:", e);
            return [] as Awaited<ReturnType<typeof listDriverApplications>>;
          })
        : Promise.resolve([]),
    ]);

    apps = [
      ...ws.map(
        (a): Row => ({
          id: a.id,
          role: "wrapstar",
          fullName: a.fullName,
          email: a.email,
          city: a.city,
          state: a.state,
          postalCode: a.postalCode,
          status: a.status,
          submittedAt: a.submittedAt,
          createdAt: a.createdAt,
          fitScore: a.fitScore,
          canDeliver: a.canDeliver,
        }),
      ),
      ...drv.map(
        (a): Row => ({
          id: a.id,
          role: "driver",
          fullName: a.fullName,
          email: a.email,
          city: a.city,
          state: a.state,
          postalCode: a.postalCode,
          status: a.status,
          submittedAt: a.submittedAt,
          createdAt: a.createdAt,
          vehicleType: a.vehicleType,
          canDeliver: "yes",
        }),
      ),
    ].sort((a, b) => (b.submittedAt || b.createdAt || "").localeCompare(a.submittedAt || a.createdAt || ""));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const href = (next: { status?: string; role?: string; q?: string }) => {
    const params = new URLSearchParams();
    params.set("status", next.status ?? status);
    params.set("role", next.role ?? role);
    const qq = next.q !== undefined ? next.q : q;
    if (qq) params.set("q", qq);
    return `/admin/applications?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold text-slate-900">Applications</h1>
      <p className="mt-1 text-sm text-slate-600">
        Hire pipeline from apply.wrrapd.com — WrapStars and Drivers. Approve to email login
        credentials for pros.wrrapd.com onboarding.
      </p>

      <form className="mt-4 flex flex-wrap items-end gap-2" method="get">
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="role" value={role} />
        <label className="block text-sm">
          Search name / email / phone
          <input
            name="q"
            defaultValue={q}
            placeholder="e.g. name or email"
            className="mt-1 block w-72 max-w-full rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm text-white">
          Search
        </button>
        {q ? (
          <Link href={href({ q: "" })} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm">
            Clear
          </Link>
        ) : null}
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {ROLE_FILTERS.map((f) => (
          <Link
            key={f.id}
            href={href({ role: f.id })}
            className={
              role === f.id
                ? "rounded-full bg-blue-800 px-3 py-1.5 text-sm text-white"
                : "rounded-full bg-blue-50 px-3 py-1.5 text-sm text-blue-900 hover:bg-blue-100"
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={href({ status: f.id })}
            className={
              status === f.id
                ? "rounded-full bg-slate-900 px-3 py-1.5 text-sm text-white"
                : "rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-200"
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      {!error ? (
        <p className="mt-3 text-sm text-slate-600">
          Showing <strong>{apps.length}</strong> application{apps.length === 1 ? "" : "s"}
          {role !== "all" ? ` · role: ${role}` : ""}
          {status !== "all" ? ` · filter: ${status}` : ""}
          {q ? ` · search: “${q}”` : ""}
        </p>
      ) : null}

      {error ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">Could not load applications from WordPress</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2 text-xs">
            Use{" "}
            <code className="rounded bg-red-100 px-1">
              WRRAPD_WRAPSTARS_WP_BASE_URL=https://api.wrrapd.com/api/wrapstars-wp-bridge
            </code>{" "}
            and matching{" "}
            <code className="rounded bg-red-100 px-1">WRRAPD_WRAPSTARS_OPS_API_KEY</code>. Deploy
            Driver MU-plugins for{" "}
            <code className="rounded bg-red-100 px-1">/driver-applications</code> routes.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Name / email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Detail</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {apps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    No applications in this view. Try <strong>All</strong>, clear search, or confirm
                    WordPress Driver routes are deployed if filtering Drivers.
                  </td>
                </tr>
              ) : (
                apps.map((a) => (
                  <tr key={`${a.role}-${a.id}`} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <Link
                        href={`/admin/applications/${a.id}?role=${a.role}`}
                        className="font-medium text-blue-700 underline"
                      >
                        {a.fullName || a.email}
                      </Link>
                      <div className="text-xs text-slate-500">{a.email}</div>
                      <div className="text-xs text-slate-400">#{a.id}</div>
                    </td>
                    <td className="px-3 py-3">
                      {a.role === "driver" ? (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-900">
                          Driver
                        </span>
                      ) : (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-900">
                          WrapStar
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {a.city}, {a.state} {a.postalCode}
                    </td>
                    <td className="px-3 py-3">
                      {a.role === "driver" ? (
                        <span className="text-xs text-slate-600">{a.vehicleType || "courier"}</span>
                      ) : a.canDeliver === "yes" ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">
                          hybrid
                        </span>
                      ) : (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-900">
                          wrap-only
                        </span>
                      )}
                      {a.role === "wrapstar" && a.fitScore ? (
                        <span className="ml-1 text-xs font-semibold">Fit {a.fitScore}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(a.status)}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      {(a.submittedAt || a.createdAt || "").slice(0, 10) || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
