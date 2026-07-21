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
import { ApplicationReviewActions } from "@/components/application-review-actions";

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

  // Block one-shot actions that were already completed (double-click / stale UI).
  const current = await getWrapstarApplication(id);
  const st = current.status;
  if (action === "approve" && !["under_review", "interview"].includes(st)) {
    redirect(`/admin/applications/${id}?ok=already_approved`);
  }
  if (action === "interview" && st !== "under_review") {
    redirect(`/admin/applications/${id}?ok=already_interview`);
  }
  if (action === "reject" && !["under_review", "interview"].includes(st)) {
    redirect(`/admin/applications/${id}?ok=already_rejected`);
  }
  if (action === "activate" && st !== "approved") {
    redirect(`/admin/applications/${id}?ok=already_active`);
  }
  if (
    action === "reset_to_review" &&
    !["approved", "declined", "interview", "rejected"].includes(st)
  ) {
    redirect(`/admin/applications/${id}?ok=reset_skipped`);
  }

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
        {app.greetingName ? ` · Greets as “${app.greetingName}”` : ""}
        {app.nickname ? ` · Nickname: ${app.nickname}` : ""}
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
          {okFlash === "already_approved"
            ? " — already approved; approve cannot run twice."
            : null}
          {okFlash === "already_interview"
            ? " — interview already requested."
            : null}
          {okFlash === "already_rejected" ? " — application already closed." : null}
          {okFlash === "already_active" ? " — already activated." : null}
          {okFlash === "reset_to_review"
            ? " — returned to Under review for re-testing Approve / welcome email."
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
          {app.status === "approved" && app.inviteExpiresAt ? (
            <p
              className={`mt-2 rounded-lg border px-3 py-2 text-sm ${
                app.inviteExpiredAt ||
                (Date.parse(app.inviteExpiresAt) > 0 && Date.parse(app.inviteExpiresAt) < Date.now())
                  ? "border-rose-200 bg-rose-50 text-rose-950"
                  : "border-slate-200 bg-slate-50 text-slate-800"
              }`}
            >
              Invitation login / Decline link expires{" "}
              {new Date(app.inviteExpiresAt).toLocaleString()}
              {app.inviteExpiredAt
                ? ` · Expired ${new Date(app.inviteExpiredAt).toLocaleString()} — use Resend welcome email`
                : " · 15 days from last credential issue"}
            </p>
          ) : null}
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

      <ApplicationReviewActions
        appId={app.id}
        status={app.status}
        suspended={app.suspended}
        adminNotes={app.adminNotes || ""}
        rejectReason={app.rejectReason || ""}
        action={actionForm}
      />
    </div>
  );
}
