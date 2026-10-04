import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type InstallRow = {
  installId: string;
  extensionVersion?: string;
  firstSeen?: string;
  lastSeen?: string;
  email?: string;
  lastPaidAt?: string;
};

const PAY_API = (process.env.WRRAPD_PAY_API_ORIGIN || "https://api.wrrapd.com").replace(/\/$/, "");
const DAY = 24 * 60 * 60 * 1000;

async function loadInstalls(): Promise<InstallRow[] | null> {
  const key = process.env.WRRAPD_PAY_INTERNAL_KEY?.trim();
  if (!key) return null;
  try {
    const res = await fetch(`${PAY_API}/api/internal/extension-installs`, {
      headers: { "X-Wrrapd-Internal-Key": key },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { installs?: InstallRow[] };
    return data.installs || [];
  } catch {
    return null;
  }
}

function countActiveSince(rows: InstallRow[], days: number) {
  const cutoff = Date.now() - days * DAY;
  return rows.filter((r) => r.lastSeen && Date.parse(r.lastSeen) > cutoff).length;
}

function fmt(iso?: string) {
  return iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York" }) : "—";
}

export default async function ExtensionInstallsPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/admin?next=/admin/extension-installs");
  const rows = await loadInstalls();
  const active = (days: number) => countActiveSince(rows || [], days);
  const versions = new Map<string, number>();
  for (const r of rows || []) versions.set(r.extensionVersion || "?", (versions.get(r.extensionVersion || "?") || 0) + 1);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-blue-800 underline">
          ← Command Center
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-[#0f172a]">Extension installs</h1>
        <p className="mt-1 text-sm text-slate-600">
          Each install has a random id and checks in once a day with its version. An email appears only after that
          install paid for a Wrrapd order.
        </p>
      </div>
      {rows === null ? (
        <p className="text-rose-700">Could not load installs from the pay server.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            {[
              ["Total installs", rows.length],
              ["Active 1 day", active(1)],
              ["Active 7 days", active(7)],
              ["Active 30 days", active(30)],
              ["Paid at least once", rows.filter((r) => r.email).length],
            ].map(([label, n]) => (
              <div key={label} className="rounded-xl border border-[#1a2744]/25 bg-white px-4 py-3 shadow-sm">
                <p className="text-2xl font-bold text-[#0f172a]">{n}</p>
                <p className="text-slate-600">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-slate-700">
            By version:{" "}
            {[...versions.entries()]
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([v, n]) => `${v} (${n})`)
              .join(" · ")}
          </p>
          <table className="w-full rounded-xl bg-white text-left text-sm shadow-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="p-2">Install</th>
                <th className="p-2">Version</th>
                <th className="p-2">First seen</th>
                <th className="p-2">Last seen</th>
                <th className="p-2">Paid by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.installId} className="border-b last:border-0">
                  <td className="p-2 font-mono">{r.installId.slice(0, 8)}</td>
                  <td className="p-2">{r.extensionVersion || "—"}</td>
                  <td className="p-2">{fmt(r.firstSeen)}</td>
                  <td className="p-2">{fmt(r.lastSeen)}</td>
                  <td className="p-2">{r.email ? `${r.email} · ${fmt(r.lastPaidAt)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
