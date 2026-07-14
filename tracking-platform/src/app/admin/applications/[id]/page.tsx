import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  getWrapstarApplication,
  runWrapstarApplicationAction,
  type ApplicationAction,
} from "@/lib/wrapstar-applications-admin";
import { syncActivatedApplicationToOpsRoster } from "@/lib/sync-activated-wrapstar";

export const dynamic = "force-dynamic";

async function actionForm(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const id = Number(formData.get("appId") || 0);
  const action = String(formData.get("action") || "") as ApplicationAction;
  const adminNotes = String(formData.get("adminNotes") || "");
  const rejectReason = String(formData.get("rejectReason") || "");
  if (!id || !action) return;

  const result = await runWrapstarApplicationAction(id, action, {
    adminNotes,
    rejectReason: action === "reject" ? rejectReason : undefined,
  });

  if (action === "activate" && result.application) {
    await syncActivatedApplicationToOpsRoster(result.application);
  }

  revalidatePath("/admin/applications");
  revalidatePath(`/admin/applications/${id}`);
  revalidatePath("/admin/wrapstars");
  redirect(`/admin/applications/${id}?ok=${encodeURIComponent(action)}`);
}

export default async function AdminApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const sp = await searchParams;
  const okFlash = typeof sp.ok === "string" ? sp.ok : undefined;

  let app: Awaited<ReturnType<typeof getWrapstarApplication>>;
  try {
    app = await getWrapstarApplication(id);
  } catch {
    notFound();
  }

  const steps = Object.entries(app.onboardingStepsComplete || {});

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/applications" className="text-sm text-blue-700 underline">
        Back to Applications
      </Link>
      <h1 className="mt-3 text-3xl font-semibold text-slate-900">{app.fullName}</h1>
      <p className="text-sm text-slate-600">
        #{app.id} · <span className="font-medium">{app.status}</span>
        {app.suspended ? " · SUSPENDED" : ""}
        {app.fitScore ? ` · Fit ${app.fitScore}/100` : ""}
      </p>

      {okFlash ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Action completed: <strong>{okFlash}</strong>
          {okFlash === "approve"
            ? " — welcome email sent with username, temporary password, and a Decline link."
            : null}
          {okFlash === "activate"
            ? " — added/updated on WrapStars ops roster for Command Center assignment."
            : null}
          {okFlash === "mark_declined"
            ? " — invitation closed; candidate listed under Declined offer."
            : null}
          {okFlash === "reinvite"
            ? " — status set back to Approved; welcome email resent with fresh credentials."
            : null}
          {okFlash === "resend_invite"
            ? " — welcome email resent with a new temporary password."
            : null}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Contact & location</h2>
          <p className="mt-2 text-sm">{app.email}</p>
          <p className="text-sm">Mobile: {app.phoneMobile || "—"}</p>
          {app.phoneWork ? <p className="text-sm">Work: {app.phoneWork}</p> : null}
          <p className="mt-2 text-sm">
            {app.addressLine1}
            {app.addressLine2 ? `, ${app.addressLine2}` : ""}
            <br />
            {app.city}, {app.state} {app.postalCode}
          </p>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Capability</h2>
          <p className="mt-2 text-sm">
            Deliver: <strong>{app.canDeliver || "—"}</strong>
            {app.canDeliver === "yes" ? " (hybrid)" : app.canDeliver === "no" ? " (wrap-only)" : ""}
          </p>
          <p className="text-sm">Vehicle: {app.hasVehicle || "n/a"}</p>
          <p className="text-sm">Max distance: {app.deliveryMaxDistance || "n/a"}</p>
          <p className="text-sm">Driving record: {app.cleanDrivingRecord || "n/a"}</p>
          <p className="text-sm">
            Custom print: {app.hasLargeFormatPrinter || "—"}
            {app.printerSize ? ` (${app.printerSize})` : ""}
          </p>
          <p className="text-sm">PO pickup: {app.wrrapdPoDailyPickup || "n/a"}</p>
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Experience & motivation</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{app.giftWrappingExperience}</p>
        <p className="mt-3 text-sm">
          <strong>Why:</strong> {app.whyWrapstar}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Gig: {app.gigPlatforms || "—"} · Business: {app.businessStructure || "—"} · Bank ready:{" "}
          {app.bankAccountReady || "—"}
        </p>
        {app.experienceRationale || app.commitmentRationale ? (
          <p className="mt-2 text-xs text-slate-500">
            Fit notes — experience: {app.experienceRationale || "—"} · commitment:{" "}
            {app.commitmentRationale || "—"}
          </p>
        ) : null}
      </section>

      {app.status === "declined" ? (
        <section className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
          <h2 className="font-semibold text-orange-950">Declined invitation</h2>
          <p className="mt-2 text-sm text-orange-950">
            Last approved {(app.approvedAt || "").slice(0, 10) || "—"} · Declined{" "}
            {(app.declinedAt || "").slice(0, 10) || "—"}
            {app.reinviteCount ? ` · Prior re-invites: ${app.reinviteCount}` : ""}
          </p>
          <p className="mt-2 text-sm text-orange-900">
            <strong>Candidate note:</strong> {app.declineNote || "—"}
          </p>
          <p className="mt-2 text-xs text-orange-800">
            Portal credentials are invalid. If the blocker is resolved, use{" "}
            <strong>Re-open invitation &amp; resend welcome email</strong> below — status returns to
            Approved (onboarding) and they get a fresh login + Decline link.
          </p>
        </section>
      ) : null}

      {app.status === "approved" && (app.previousDeclinedAt || app.reinvitedAt) ? (
        <section className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
          <h2 className="font-semibold text-indigo-950">Re-opened after decline</h2>
          <p className="mt-2 text-sm text-indigo-950">
            Previously declined {(app.previousDeclinedAt || "").slice(0, 10) || "—"}
            {app.reinvitedAt ? ` · Re-invited ${(app.reinvitedAt || "").slice(0, 10)}` : ""}
            {app.reinviteCount ? ` · Times re-invited: ${app.reinviteCount}` : ""}
          </p>
          {app.declineNote ? (
            <p className="mt-2 text-sm text-indigo-900">
              <strong>Original decline note:</strong> {app.declineNote}
            </p>
          ) : null}
        </section>
      ) : null}

      {app.status === "approved" || app.status === "active" ? (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Onboarding progress (pros.wrrapd.com)</h2>
          {app.mustChangePassword ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Waiting on first-login password change (required before onboarding steps).
            </p>
          ) : null}
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {steps.map(([step, done]) => (
              <li key={step} className={done ? "text-emerald-800" : "text-slate-500"}>
                {done ? "✓" : "○"} {step}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Current step: {app.onboardingStep || "—"}</p>
        </section>
      ) : null}

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Review actions</h2>
        <form action={actionForm} className="mt-3 space-y-3">
          <input type="hidden" name="appId" value={app.id} />
          <label className="block text-sm">
            Reviewer notes
            <textarea
              name="adminNotes"
              rows={3}
              defaultValue={app.adminNotes || ""}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </label>
          {(app.status === "under_review" || app.status === "interview") && (
            <label className="block text-sm">
              Reject reason (required for Reject)
              <textarea
                name="rejectReason"
                rows={2}
                defaultValue={app.rejectReason || ""}
                className="mt-1 w-full rounded border px-3 py-2"
                placeholder="Shown in the rejection email"
              />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              name="action"
              value="save_notes"
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              Save notes
            </button>
            {app.status === "under_review" ? (
              <>
                <button
                  type="submit"
                  name="action"
                  value="interview"
                  className="rounded bg-sky-700 px-3 py-2 text-sm text-white"
                >
                  Request Zoom interview
                </button>
                <button
                  type="submit"
                  name="action"
                  value="approve"
                  className="rounded bg-indigo-700 px-3 py-2 text-sm font-semibold text-white"
                >
                  Approve for onboarding
                </button>
                <button
                  type="submit"
                  name="action"
                  value="reject"
                  className="rounded bg-rose-700 px-3 py-2 text-sm text-white"
                >
                  Reject
                </button>
              </>
            ) : null}
            {app.status === "interview" ? (
              <>
                <button
                  type="submit"
                  name="action"
                  value="approve"
                  className="rounded bg-indigo-700 px-3 py-2 text-sm font-semibold text-white"
                >
                  Passed interview — approve
                </button>
                <button
                  type="submit"
                  name="action"
                  value="reject"
                  className="rounded bg-rose-700 px-3 py-2 text-sm text-white"
                >
                  Reject
                </button>
              </>
            ) : null}
            {app.status === "declined" ? (
              <button
                type="submit"
                name="action"
                value="reinvite"
                className="rounded bg-indigo-700 px-3 py-2 text-sm font-semibold text-white"
              >
                Re-open invitation &amp; resend welcome email
              </button>
            ) : null}
            {app.status === "approved" ? (
              <>
                <button
                  type="submit"
                  name="action"
                  value="activate"
                  className="rounded bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"
                >
                  Activate WrapStar (live)
                </button>
                <button
                  type="submit"
                  name="action"
                  value="resend_invite"
                  className="rounded bg-sky-700 px-3 py-2 text-sm text-white"
                >
                  Resend welcome email
                </button>
                <button
                  type="submit"
                  name="action"
                  value="mark_declined"
                  className="rounded bg-orange-700 px-3 py-2 text-sm text-white"
                >
                  Mark as declined offer
                </button>
              </>
            ) : null}
            {app.status === "active" && !app.suspended ? (
              <button
                type="submit"
                name="action"
                value="suspend"
                className="rounded bg-amber-700 px-3 py-2 text-sm text-white"
              >
                Suspend
              </button>
            ) : null}
            {app.suspended ? (
              <button
                type="submit"
                name="action"
                value="unsuspend"
                className="rounded bg-slate-800 px-3 py-2 text-sm text-white"
              >
                Unsuspend
              </button>
            ) : null}
          </div>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          Approve / re-invite emails username (email), a fresh temporary password, login link, and a
          Decline link. First login forces a password change. Declined offers live under{" "}
          <Link className="underline" href="/admin/applications?status=declined">
            Declined offer
          </Link>
          ; re-open from that detail page when you want them back in onboarding.
        </p>
      </section>
    </div>
  );
}
