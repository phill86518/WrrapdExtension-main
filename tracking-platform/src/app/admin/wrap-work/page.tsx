import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listWrapShifts, shiftPace } from "@/lib/shift-store";
import { sendMorningWrapSheets } from "@/lib/wrapstar-morning-email";
import { listRegisteredWrapstars } from "@/lib/wrapstar-registry";

export const dynamic = "force-dynamic";

function hoursLabel(hours: number): string {
  const mins = Math.round(hours * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

async function sendSheetsAction() {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  await sendMorningWrapSheets();
  revalidatePath("/admin/wrap-work");
}

export default async function WrapWorkPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();

  const [shifts, wrapstars] = await Promise.all([listWrapShifts(60), listRegisteredWrapstars()]);
  const names = new Map(wrapstars.map((w) => [w.id, w.name]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Wrap hours</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Clock-in and clock-out for each WrapStar, the gifts they wrapped, and the code stuck on
            each box. Pace is 12 gifts an hour.
          </p>
        </div>
        <form action={sendSheetsAction}>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Send today&apos;s 8am sheets
          </button>
        </form>
      </div>

      {shifts.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
          No shifts yet. Sending the morning sheet creates today&apos;s codes. Start shift begins the clock.
        </p>
      ) : (
        <div className="space-y-4">
          {shifts.map((shift) => {
            const pace = shiftPace(shift);
            const name = names.get(shift.wrapstarId) || shift.wrapstarId;
            return (
              <article key={shift.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">
                    <Link className="underline" href={`/admin/wrapstars/${shift.wrapstarId}`}>
                      {name}
                    </Link>
                    <span className="ml-2 text-sm font-normal text-slate-500">{shift.dateKey}</span>
                  </h2>
                  <p className="text-sm text-slate-600">
                    {shift.status === "sheet"
                      ? "Sheet sent · not clocked in"
                      : shift.status === "active"
                        ? "On shift"
                        : "Ended"}
                    {shift.morningEmailSentAt ? " · email sent" : ""}
                  </p>
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-slate-500">Clock in</dt>
                    <dd>{shift.startedAt ? new Date(shift.startedAt).toLocaleString() : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Clock out</dt>
                    <dd>{shift.endedAt ? new Date(shift.endedAt).toLocaleString() : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Hours</dt>
                    <dd>{hoursLabel(pace.hours)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Wrapped</dt>
                    <dd>
                      {pace.wrapped} / {pace.itemCount}
                      {pace.hours > 0 ? ` · ${pace.perHour.toFixed(1)} / hr` : ""}
                      {pace.behind > 0 ? ` · ${pace.behind} behind pace` : ""}
                    </dd>
                  </div>
                </dl>
                {shift.items && shift.items.length > 0 ? (
                  <ul className="mt-4 divide-y divide-slate-100 text-sm">
                    {shift.items.map((item) => (
                      <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <div>
                          <span className="font-mono font-semibold">{item.code}</span>{" "}
                          <Link className="underline" href={`/admin/orders/${item.orderId}`}>
                            {item.title}
                          </Link>
                          <span className="text-slate-500">
                            {item.needsBox ? ` · box${item.boxSize ? ` ${item.boxSize}` : ""}` : ""}
                            {item.customPrint ? " · custom wrap" : ""}
                            {item.boxPickedAt ? " · box picked up" : ""}
                          </span>
                        </div>
                        <span className="text-xs uppercase tracking-wide text-slate-500">{item.phase}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">No gift rows on this shift.</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
