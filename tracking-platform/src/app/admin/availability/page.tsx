import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { getSession } from "@/lib/auth";
import { listWrapstars, listCourierDrivers } from "@/lib/data";
import { listWeekRecords, mondayOfWeekContaining, availabilityDeadlineForWeekMonday } from "@/lib/availability-store";
import { getWrapstarProfile } from "@/lib/wrapstar-profiles";
import { ensureDemoStaffing } from "@/lib/demo-staffing";
import type { DayShiftAvailability, WeekAvailabilityRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

function pick(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

function monthMatrix(year: number, month0: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month0, 1));
  const startDow = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(month0 + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    cells.push(`${year}-${mm}-${dd}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

function shiftsFor(
  rec: WeekAvailabilityRecord | undefined,
  dateKey: string,
): DayShiftAvailability {
  const raw = rec?.days?.[dateKey];
  if (!raw) return { morning: false, afternoon: false };
  if (typeof raw === "boolean") return { morning: raw, afternoon: raw };
  return {
    morning: raw.morning === true,
    afternoon: raw.afternoon === true,
  };
}

type PersonRow = {
  id: string;
  name: string;
  role: "WrapStar" | "JoyRider";
  morning: boolean;
  afternoon: boolean;
  submitted: boolean;
  forced: boolean;
};

export default async function AdminAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();

  await ensureDemoStaffing();

  const sp = await searchParams;
  const todayKey = formatInTimeZone(new Date(), "America/New_York", "yyyy-MM-dd");
  const dateKey = pick(sp.date) || todayKey;
  const ym = pick(sp.ym) || dateKey.slice(0, 7);
  const [yStr, mStr] = ym.split("-");
  const year = Number(yStr);
  const month0 = Number(mStr) - 1;
  const rows = monthMatrix(year, month0);

  const weekStart = mondayOfWeekContaining(parseISO(`${dateKey}T12:00:00`));
  const deadline = availabilityDeadlineForWeekMonday(weekStart);
  const deadlineLabel = formatInTimeZone(deadline, "America/New_York", "EEE MMM d, h:mm a zzz");
  const pastDeadline = Date.now() > deadline.getTime();

  const [wrapstars, joyriders, records] = await Promise.all([
    listWrapstars(),
    listCourierDrivers(),
    listWeekRecords(),
  ]);

  const byId = new Map<string, WeekAvailabilityRecord>();
  for (const r of records) {
    if (r.weekStartMonday !== weekStart) continue;
    const id = r.wrapstarId || r.driverId;
    if (id) byId.set(id, r);
  }

  const people: PersonRow[] = [];

  for (const w of wrapstars) {
    const profile = await getWrapstarProfile(w.id);
    if (profile.onboardingStatus !== "approved") continue;
    const rec = byId.get(w.id);
    const forced = (profile.forcedAvailableDates || []).includes(dateKey);
    const s = shiftsFor(rec, dateKey);
    people.push({
      id: w.id,
      name: w.name,
      role: "WrapStar",
      morning: forced || s.morning,
      afternoon: forced || s.afternoon,
      submitted: Boolean(rec),
      forced,
    });
  }

  for (const d of joyriders) {
    if (d.status !== "approved") continue;
    const rec = byId.get(d.id);
    const s = shiftsFor(rec, dateKey);
    people.push({
      id: d.id,
      name: d.name,
      role: "JoyRider",
      morning: s.morning,
      afternoon: s.afternoon,
      submitted: Boolean(rec),
      forced: false,
    });
  }

  people.sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));

  const wrapAvailable = people.filter((p) => p.role === "WrapStar" && (p.morning || p.afternoon));
  const joyAvailable = people.filter((p) => p.role === "JoyRider" && (p.morning || p.afternoon));
  const missingSubmit = people.filter((p) => !p.submitted && !p.forced);

  const prevMonth = month0 === 0 ? `${year - 1}-12` : `${year}-${String(month0).padStart(2, "0")}`;
  const nextMonth =
    month0 === 11 ? `${year + 1}-01` : `${year}-${String(month0 + 2).padStart(2, "0")}`;

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#0f172a]">Staff availability</h1>
        <p className="mt-1 text-sm text-slate-700">
          Click a day to see who submitted morning (7a–1p) / afternoon (1p–7p) for allocation.
          Deadline for week of <span className="font-mono">{weekStart}</span>:{" "}
          <strong>{deadlineLabel}</strong>
          {pastDeadline ? " (closed — no submit = unavailable)." : " (still open)."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link className="rounded border px-3 py-1.5" href={`/admin/availability?ym=${prevMonth}&date=${dateKey}`}>
          ← Prev
        </Link>
        <span className="font-semibold">{format(parseISO(`${ym}-01`), "MMMM yyyy")}</span>
        <Link className="rounded border px-3 py-1.5" href={`/admin/availability?ym=${nextMonth}&date=${dateKey}`}>
          Next →
        </Link>
        <Link className="rounded border px-3 py-1.5" href={`/admin/availability?date=${todayKey}`}>
          Today
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b bg-slate-50 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-1 py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {rows.flat().map((cell, i) => {
            if (!cell) {
              return <div key={`e-${i}`} className="min-h-[64px] border-b border-r bg-slate-50/40" />;
            }
            const selected = cell === dateKey;
            const isToday = cell === todayKey;
            return (
              <Link
                key={cell}
                href={`/admin/availability?ym=${ym}&date=${cell}`}
                className={`min-h-[64px] border-b border-r p-2 text-sm transition hover:bg-amber-50 ${
                  selected ? "bg-amber-100 font-bold" : ""
                } ${isToday && !selected ? "ring-1 ring-inset ring-amber-400" : ""}`}
              >
                {Number(cell.slice(8))}
              </Link>
            );
          })}
        </div>
      </div>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">
          {format(parseISO(`${dateKey}T12:00:00`), "EEEE, MMM d, yyyy")}
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Work week Monday: <span className="font-mono">{weekStart}</span> · WrapStars available:{" "}
          {wrapAvailable.length} · JoyRiders available: {joyAvailable.length}
          {pastDeadline && missingSubmit.length > 0
            ? ` · ${missingSubmit.length} missing submission (treated unavailable)`
            : null}
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">7a–1p</th>
                <th className="py-2 pr-3">1p–7p</th>
                <th className="py-2 pr-3">Submitted</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={`${p.role}-${p.id}`} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{p.name}</td>
                  <td className="py-2 pr-3">{p.role}</td>
                  <td className="py-2 pr-3">{p.morning ? "Yes" : "—"}</td>
                  <td className="py-2 pr-3">{p.afternoon ? "Yes" : "—"}</td>
                  <td className="py-2 pr-3">{p.submitted ? "Yes" : pastDeadline ? "No" : "Pending"}</td>
                  <td className="py-2 text-xs text-slate-600">
                    {p.forced ? "Admin forced available" : null}
                    {!p.submitted && pastDeadline && !p.forced ? "Unavailable for allocation" : null}
                  </td>
                </tr>
              ))}
              {people.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-slate-500">
                    No approved contractors on roster.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
