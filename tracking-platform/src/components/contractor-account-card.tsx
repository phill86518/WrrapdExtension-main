import type { ContractorRecord } from "@/lib/contractor-records";
import { formatDateTimeNy } from "@/lib/ny-date";

function dateOnly(iso?: string): string {
  if (!iso) return "";
  const s = formatDateTimeNy(iso);
  return s.replace(/,\s+\d{1,2}:\d{2}\s*[AP]M\s*ET$/i, "");
}

type Props = {
  record: ContractorRecord | null;
  roleLabel: "WrapStar" | "JoyRider";
  /** WordPress profile page where contact details + password are managed */
  profileUrl: string;
};

/**
 * Uber/DoorDash-style "Account" tab: who you are to Wrrapd, what's signed and on file, how you get
 * paid, and key dates. Read-only here — edits happen on the WordPress profile page.
 */
export function ContractorAccountCard({ record, roleLabel, profileUrl }: Props) {
  if (!record) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Your {roleLabel} account</h3>
        <p className="mt-2 text-sm text-slate-600">
          Your contractor record has not been migrated yet. It appears here automatically after
          Wrrapd approves your onboarding.
        </p>
        <a
          href={profileUrl}
          className="mt-3 inline-block text-sm font-semibold text-blue-700 underline"
        >
          View your profile
        </a>
      </section>
    );
  }

  const address = [
    record.addressLine1,
    record.addressLine2,
    [record.city, record.state].filter(Boolean).join(", ") +
      (record.postalCode ? ` ${record.postalCode}` : ""),
  ]
    .filter((s) => s && s.trim())
    .join(" · ");

  const payoutLine = (() => {
    const p = record.payout || {};
    if (!p.method) return "Not set up yet";
    if (p.method === "direct_deposit") {
      return [
        "Direct deposit",
        p.bankName,
        p.accountType ? p.accountType.charAt(0).toUpperCase() + p.accountType.slice(1) : "",
        p.accountLast4 ? `ending ${p.accountLast4}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
    }
    if (p.method === "connect") return "Connected payout account";
    return p.method;
  })();

  const complete = record.documents.filter((d) => d.status === "complete").length;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{record.fullName}</h3>
            <p className="text-xs text-slate-500">
              {roleLabel} · <span className="font-mono">{record.rosterId}</span>
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900">
            Active {roleLabel}
            {record.timeline.activatedAt ? ` since ${dateOnly(record.timeline.activatedAt)}` : ""}
          </span>
        </div>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Email</dt>
            <dd className="text-slate-800">{record.email}</dd>
          </div>
          {record.phoneMobile ? (
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mobile</dt>
              <dd className="text-slate-800">{record.phoneMobile}</dd>
            </div>
          ) : null}
          {address ? (
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mailing address</dt>
              <dd className="text-slate-800">{address}</dd>
            </div>
          ) : null}
          {Object.entries(record.attributes || {}).map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
              <dd className="text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
        <a
          href={profileUrl}
          className="mt-3 inline-block text-sm font-semibold text-blue-700 underline"
        >
          Edit contact details or password
        </a>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Agreements &amp; documents</h3>
          <span className="text-xs text-slate-500">
            {complete} of {record.documents.length} on file
          </span>
        </div>
        <ul className="mt-2 divide-y divide-slate-100">
          {record.documents.map((d) => (
            <li key={d.key} className="flex items-start gap-3 py-2 text-sm">
              <span
                aria-hidden
                className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  d.status === "complete"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {d.status === "complete" ? "✓" : "○"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-slate-800">{d.label}</span>
                <span className="block text-xs text-slate-500">
                  {d.status === "complete" ? "Complete" : "Pending"}
                  {d.at ? ` · ${dateOnly(d.at)}` : ""}
                  {d.detail ? ` · ${d.detail}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Payout method</h3>
        <p className="mt-1 text-sm text-slate-800">{payoutLine}</p>
        {record.payout?.holderName ? (
          <p className="text-xs text-slate-500">Account holder: {record.payout.holderName}</p>
        ) : null}
        <p className="mt-2 text-xs text-slate-500">
          To change your bank account, email Wrrapd support from your account email.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Key dates</h3>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          {record.timeline.submittedAt ? (
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Applied</dt>
              <dd className="text-slate-800">{dateOnly(record.timeline.submittedAt)}</dd>
            </div>
          ) : null}
          {record.timeline.interviewAt ? (
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Interview</dt>
              <dd className="text-slate-800">{dateOnly(record.timeline.interviewAt)}</dd>
            </div>
          ) : null}
          {record.timeline.approvedAt ? (
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Approved</dt>
              <dd className="text-slate-800">{dateOnly(record.timeline.approvedAt)}</dd>
            </div>
          ) : null}
          {record.timeline.activatedAt ? (
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Activated</dt>
              <dd className="text-slate-800">{dateOnly(record.timeline.activatedAt)}</dd>
            </div>
          ) : null}
          {record.lastLoginAt ? (
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Last sign-in</dt>
              <dd className="text-slate-800">{formatDateTimeNy(record.lastLoginAt)}</dd>
            </div>
          ) : null}
        </dl>
      </section>
    </div>
  );
}
