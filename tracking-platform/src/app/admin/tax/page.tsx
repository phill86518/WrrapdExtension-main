import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { formatUsdCents } from "@/lib/finance";
import {
  NEC_THRESHOLD_CENTS,
  emailTaxStatement,
  listContractorPayPeople,
  listTaxStatements,
  markTaxStatementMailed,
  payHistoryForContractor,
  upsertTaxStatement,
} from "@/lib/contractor-pay-history";
import { listWeeklyPayLines } from "@/lib/weekly-pay";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/admin");
}

async function refreshStatementAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const year = Number(formData.get("year"));
  const contractorId = String(formData.get("contractorId") || "");
  await upsertTaxStatement({ year, contractorId });
  revalidatePath("/admin/tax");
}

async function emailStatementAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const year = Number(formData.get("year"));
  const contractorId = String(formData.get("contractorId") || "");
  const result = await emailTaxStatement({ year, contractorId });
  const q = result.ok ? "emailed=1" : `emailError=${encodeURIComponent(result.error)}`;
  revalidatePath("/admin/tax");
  redirect(`/admin/tax?${q}`);
}

async function markMailedAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const year = Number(formData.get("year"));
  const contractorId = String(formData.get("contractorId") || "");
  await markTaxStatementMailed({ year, contractorId });
  revalidatePath("/admin/tax");
  redirect("/admin/tax?mailed=1");
}

function roleLabel(role: string): string {
  if (role === "wrapstar") return "WrapStar";
  if (role === "joyrider") return "JoyRider";
  return "WrapRider";
}

export default async function AdminTaxPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; emailed?: string; mailed?: string; emailError?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/admin");
  const query = await searchParams;
  const roleFilter = query.role === "wrapstar" || query.role === "joyrider" || query.role === "wraprider" ? query.role : "";
  const people = (await listContractorPayPeople()).filter((person) => !roleFilter || person.role === roleFilter);
  const [stored, allLines] = await Promise.all([listTaxStatements(), listWeeklyPayLines()]);
  const rows = await Promise.all(
    people.map(async (person) => ({
      person,
      history: await payHistoryForContractor(person.contractorId, allLines),
    })),
  );
  const withPay = rows.filter((row) => row.history.years.length > 0);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold text-slate-900">Tax forms</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Each calendar year of paid weeks is stored here. Open the statement, email it, and mark it mailed after the paper copy goes out.
        A 1099-NEC copy is flagged when the year reaches {formatUsdCents(NEC_THRESHOLD_CENTS)}.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/tax" className={`rounded px-3 py-1.5 ${roleFilter === "" ? "bg-slate-900 text-white" : "border border-slate-300"}`}>
          All roles
        </Link>
        <Link href="/admin/tax?role=wrapstar" className={`rounded px-3 py-1.5 ${roleFilter === "wrapstar" ? "bg-slate-900 text-white" : "border border-slate-300"}`}>
          WrapStars
        </Link>
        <Link href="/admin/tax?role=joyrider" className={`rounded px-3 py-1.5 ${roleFilter === "joyrider" ? "bg-slate-900 text-white" : "border border-slate-300"}`}>
          JoyRiders
        </Link>
        <Link href="/admin/tax?role=wraprider" className={`rounded px-3 py-1.5 ${roleFilter === "wraprider" ? "bg-slate-900 text-white" : "border border-slate-300"}`}>
          WrapRiders
        </Link>
      </div>
      {query.emailed === "1" ? <p className="mt-3 text-sm text-emerald-700">Statement emailed.</p> : null}
      {query.mailed === "1" ? <p className="mt-3 text-sm text-emerald-700">Marked mailed.</p> : null}
      {query.emailError ? <p className="mt-3 text-sm text-red-700">{query.emailError}</p> : null}
      {withPay.length === 0 ? (
        <p className="mt-6 text-sm text-slate-600">No paid weeks yet for this list.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {withPay.map(({ person, history }) => (
            <section key={person.contractorId} className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">{person.name}</h2>
                <p className="text-sm text-slate-600">
                  {roleLabel(person.role)} · This year {formatUsdCents(history.ytdCents)} · Last year {formatUsdCents(history.lastYearCents)}
                </p>
              </div>
              <ul className="mt-3 divide-y divide-slate-100">
                {history.years.map((year) => {
                  const saved = stored.find((row) => row.contractorId === person.contractorId && row.year === year.year);
                  return (
                    <li key={year.year} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div>
                        <p className="font-medium text-slate-900">
                          {year.year} · {formatUsdCents(year.paidCents)}
                          {year.paidCents >= NEC_THRESHOLD_CENTS ? " · 1099-NEC" : ""}
                        </p>
                        <p className="text-sm text-slate-600">
                          {saved?.emailedAt ? `Emailed ${saved.emailedAt.slice(0, 10)}` : "Not emailed"}
                          {" · "}
                          {saved?.mailedAt ? `Mailed ${saved.mailedAt.slice(0, 10)}` : "Not marked mailed"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/api/contractor/pay-statement?year=${year.year}&contractorId=${encodeURIComponent(person.contractorId)}`}
                          className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium"
                          target="_blank"
                        >
                          Open
                        </Link>
                        <form action={refreshStatementAction}>
                          <input type="hidden" name="year" value={year.year} />
                          <input type="hidden" name="contractorId" value={person.contractorId} />
                          <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium">
                            Save
                          </button>
                        </form>
                        <form action={emailStatementAction}>
                          <input type="hidden" name="year" value={year.year} />
                          <input type="hidden" name="contractorId" value={person.contractorId} />
                          <button type="submit" className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
                            Email
                          </button>
                        </form>
                        <form action={markMailedAction}>
                          <input type="hidden" name="year" value={year.year} />
                          <input type="hidden" name="contractorId" value={person.contractorId} />
                          <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium">
                            Mark mailed
                          </button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
