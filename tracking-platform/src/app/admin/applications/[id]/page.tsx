import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  getWrapstarApplication,
  runWrapstarApplicationAction,
  type ApplicationAction,
  type WrapstarApplication,
} from "@/lib/wrapstar-applications-admin";
import {
  getDriverApplication,
  runDriverApplicationAction,
  type DriverApplication,
} from "@/lib/driver-applications-admin";
import { syncActivatedApplicationToOpsRoster } from "@/lib/sync-activated-wrapstar";
import { syncActivatedApplicationToDriverRoster } from "@/lib/sync-activated-driver";
import { ApplicationReviewActions } from "@/components/application-review-actions";
import { hireRoleLabel, WRAPSTAR_ONBOARDING_STEP_LABELS } from "@/lib/role-labels";
import { formatDateTimeNy } from "@/lib/ny-date";
import { hireTimelineRows } from "@/lib/hire-timeline";

export const dynamic = "force-dynamic";

function pick(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

async function actionForm(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const id = Number(formData.get("appId") || 0);
  const action = String(formData.get("action") || "") as ApplicationAction;
  const role = String(formData.get("role") || "wrapstar") === "driver" ? "driver" : "wrapstar";
  const adminNotes = String(formData.get("adminNotes") || "");
  const rejectReason = String(formData.get("rejectReason") || "");
  const bgStatus = String(formData.get("bgStatus") || "");
  if (!id || !action) return;

  const current =
    role === "driver" ? await getDriverApplication(id) : await getWrapstarApplication(id);
  const st = current.status;
  if (
    (action === "approve" || action === "approve_without_interview") &&
    !["under_review", "interview"].includes(st)
  ) {
    redirect(`/admin/applications/${id}?role=${role}&ok=already_approved`);
  }
  if (action === "interview" && st !== "under_review") {
    redirect(`/admin/applications/${id}?role=${role}&ok=already_interview`);
  }
  if (action === "reject" && !["under_review", "interview"].includes(st)) {
    redirect(`/admin/applications/${id}?role=${role}&ok=already_rejected`);
  }
  if (action === "activate" && st !== "approved") {
    redirect(`/admin/applications/${id}?role=${role}&ok=already_active`);
  }
  if ((action === "reopen_onboarding" || action === "close_onboarding") && st !== "active") {
    redirect(`/admin/applications/${id}?role=${role}&ok=not_active`);
  }
  if (
    action === "reset_to_review" &&
    !["approved", "declined", "interview", "rejected"].includes(st)
  ) {
    redirect(`/admin/applications/${id}?role=${role}&ok=reset_skipped`);
  }

  if (role === "driver") {
    const result = await runDriverApplicationAction(id, action, {
      adminNotes,
      rejectReason: action === "reject" ? rejectReason : undefined,
    });
    if (action === "activate" && result.application) {
      await syncActivatedApplicationToDriverRoster(result.application);
    }
  } else {
    const result = await runWrapstarApplicationAction(id, action, {
      adminNotes,
      rejectReason: action === "reject" ? rejectReason : undefined,
      bgStatus: action === "save_bg_status" ? bgStatus : undefined,
    });
    if (action === "activate" && result.application) {
      await syncActivatedApplicationToOpsRoster(result.application);
    }
  }

  revalidatePath("/admin/applications");
  revalidatePath(`/admin/applications/${id}`);
  revalidatePath("/admin/wrapstars");
  revalidatePath("/admin/drivers");
  redirect(`/admin/applications/${id}?role=${role}&ok=${encodeURIComponent(action)}`);
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
  let role: "wrapstar" | "driver" =
    pick(sp.role) === "driver" ? "driver" : "wrapstar";

  let app: WrapstarApplication | DriverApplication;
  try {
    if (role === "driver") {
      app = await getDriverApplication(id);
    } else {
      app = await getWrapstarApplication(id);
    }
  } catch {
    // ID may belong to the other CPT — try the other role once.
    try {
      if (role === "driver") {
        app = await getWrapstarApplication(id);
        role = "wrapstar";
      } else {
        app = await getDriverApplication(id);
        role = "driver";
      }
    } catch {
      notFound();
    }
  }

  const isDriver = role === "driver";
  const driverApp = isDriver ? (app as DriverApplication) : null;
  const wrapApp = !isDriver ? (app as WrapstarApplication) : null;
  const steps = Object.entries(app.onboardingStepsComplete || {});
  const onboarding = wrapApp?.onboarding;
  const timeline = hireTimelineRows({
    submittedAt: app.submittedAt,
    createdAt: app.createdAt,
    interviewAt: app.interviewAt,
    interviewSkippedAt: app.interviewSkippedAt,
    approvedAt: app.approvedAt,
    inviteSentAt: app.inviteSentAt,
    inviteExpiresAt: app.inviteExpiresAt,
    inviteExpiredAt: app.inviteExpiredAt,
    activatedAt: app.activatedAt,
    rejectedAt: app.rejectedAt,
    declinedAt: app.declinedAt,
    previousDeclinedAt: app.previousDeclinedAt,
    reinvitedAt: app.reinvitedAt,
    suspendedAt: app.suspendedAt,
    unsuspendedAt: app.unsuspendedAt,
    notesUpdatedAt: app.notesUpdatedAt,
    resetAt: app.resetAt,
  });

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={`/admin/applications?role=${role}`}
        className="text-sm text-blue-700 underline"
      >
        Back to Applications
      </Link>
      <h1 className="mt-3 text-3xl font-semibold text-slate-900">{app.fullName}</h1>
      <p className="text-sm text-slate-600">
        #{app.id} ·{" "}
        <span
          className={
            isDriver
              ? "rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900"
              : "rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900"
          }
        >
          {hireRoleLabel(role)}
        </span>{" "}
        · <span className="font-medium">{app.status}</span>
        {app.interviewSkipped ? (
          <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900">
            interview skipped
          </span>
        ) : null}
        {app.suspended ? " · SUSPENDED" : ""}
        {!isDriver && "fitScore" in app && app.fitScore ? ` · Fit ${app.fitScore}/100` : ""}
        {app.greetingName ? ` · Greets as “${app.greetingName}”` : ""}
      </p>

      {okFlash ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Action completed: <strong>{okFlash}</strong>
          {okFlash === "approve" || okFlash === "approve_without_interview"
            ? " — welcome email sent with username, temporary password, and a Decline link."
            : null}
          {okFlash === "approve_without_interview"
            ? " Interview was skipped."
            : null}
          {okFlash === "activate"
            ? isDriver
              ? " — added/updated on the JoyRider ops roster for courier assignment."
              : " — added/updated on WrapStars ops roster for Command Center assignment."
            : null}
          {okFlash === "reinvite"
            ? " — status set back to Approved; welcome email resent with fresh credentials."
            : null}
          {okFlash === "resend_invite"
            ? " — welcome email resent with a new temporary password."
            : null}
          {okFlash === "save_bg_status" ? " — background-check status saved." : null}
          {okFlash === "activate"
            ? " Onboarding site is now closed for them; they sign in only at the contractor portal."
            : null}
          {okFlash === "reopen_onboarding"
            ? " — onboarding site reopened for this contractor; a short email with the link was sent. Close it again when they're done."
            : null}
          {okFlash === "close_onboarding"
            ? " — onboarding site closed again and their onboarding sessions were signed out."
            : null}
          {okFlash === "not_active" ? " — skipped: only active contractors can have onboarding reopened or closed." : null}
        </p>
      ) : null}

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Hire timeline</h2>
        <p className="mt-1 text-xs text-slate-500">All times Eastern (ET).</p>
        {timeline.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No hire timestamps on this application yet.</p>
        ) : (
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {timeline.map((row) => (
              <div key={row.key} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">{row.label}</dt>
                <dd className="text-sm font-medium text-slate-900">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Contact & location</h2>
          <p className="mt-2 text-sm">{app.email}</p>
          <p className="text-sm">Mobile: {app.phoneMobile || "—"}</p>
          <p className="mt-2 text-sm">
            {app.addressLine1}
            {app.addressLine2 ? `, ${app.addressLine2}` : ""}
            <br />
            {app.city}, {app.state} {app.postalCode}
          </p>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">{isDriver ? "JoyRider profile" : "Wrap setup"}</h2>
          {isDriver && driverApp ? (
            <>
              <p className="mt-2 text-sm">
                Age 21+: <strong>{driverApp.age21 || "—"}</strong>
              </p>
              <p className="text-sm">Valid license: {driverApp.hasValidLicense || "—"}</p>
              <p className="text-sm">Vehicle: {driverApp.hasVehicle || "—"}</p>
              <p className="text-sm">Type: {driverApp.vehicleType || "—"}</p>
              <p className="text-sm">Smartphone: {driverApp.hasSmartphone || "—"}</p>
              <p className="text-sm">Driving record: {driverApp.cleanDrivingRecord || "—"}</p>
              <p className="text-sm">Bank ready: {driverApp.bankAccountReady || "—"}</p>
            </>
          ) : "dedicatedWrapWorkspace" in app ? (
            <>
              <p className="mt-2 text-sm">
                Workspace: <strong>{app.dedicatedWrapWorkspace || "—"}</strong>
              </p>
              <p className="text-sm">
                Custom print: {app.hasLargeFormatPrinter || "—"}
                {app.printerSize ? ` (${app.printerSize})` : ""}
              </p>
              <p className="text-sm">Video documentation: {app.comfortableVideoMonitoring || "—"}</p>
              <p className="text-sm">Finished-wrap photos: {app.deliveryProofReady || "—"}</p>
              <p className="text-sm">Bank ready: {app.bankAccountReady || "—"}</p>
              <p className="text-sm">Business: {app.businessStructure || "—"}</p>
            </>
          ) : null}
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold">{isDriver ? "Availability & motivation" : "Experience & motivation"}</h2>
        {isDriver && driverApp ? (
          <>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
              {driverApp.availability || "—"}
            </p>
            {driverApp.deliveryExperience ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                <strong>Experience:</strong> {driverApp.deliveryExperience}
              </p>
            ) : null}
            <p className="mt-3 text-sm">
              <strong>Why:</strong> {driverApp.whyDrive || driverApp.whyWrapstar || "—"}
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
              {"giftWrappingExperience" in app ? app.giftWrappingExperience : ""}
            </p>
            <p className="mt-3 text-sm">
              <strong>Why:</strong> {"whyWrapstar" in app ? app.whyWrapstar : "—"}
            </p>
          </>
        )}
      </section>

      {app.status === "approved" || app.status === "active" ? (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">
            Onboarding progress (
            {isDriver ? "pros.wrrapd.com/driver-onboarding" : "pros.wrrapd.com/onboarding"})
          </h2>
          {app.status === "approved" && app.inviteExpiresAt ? (
            <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
              Invitation expires {formatDateTimeNy(app.inviteExpiresAt) || app.inviteExpiresAt}
            </p>
          ) : null}
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {steps.map(([step, done]) => (
              <li key={step} className={done ? "text-emerald-800" : "text-slate-500"}>
                {done ? "✓" : "○"} {WRAPSTAR_ONBOARDING_STEP_LABELS[step] || step}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Current step: {app.onboardingStep || "—"}</p>
          {onboarding ? (
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-slate-500">Policies</dt>
                <dd>
                  {formatDateTimeNy(onboarding.policiesSignedAt) || onboarding.policiesSignedAt || "—"}
                  {onboarding.policiesSignature ? ` · ${onboarding.policiesSignature}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Orientation</dt>
                <dd>{onboarding.orientationScore ? `${onboarding.orientationScore}%` : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Background</dt>
                <dd>
                  {onboarding.bgStatus || "not started"}
                  {onboarding.bgLegalName ? ` · ${onboarding.bgLegalName}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Insurance</dt>
                <dd>
                  {onboarding.hasInsuranceFile ? "COI uploaded" : "no file"}
                  {onboarding.insuranceCarrier ? ` · ${onboarding.insuranceCarrier}` : ""}
                  {onboarding.insuranceExpires ? ` · exp ${onboarding.insuranceExpires}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Identity</dt>
                <dd>
                  {onboarding.hasIdentitySelfie ? "selfie on file" : "no selfie"}
                  {onboarding.identityConfirmedAt
                    ? ` · ${formatDateTimeNy(onboarding.identityConfirmedAt) || onboarding.identityConfirmedAt}`
                    : ""}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase text-slate-500">Wrapping location</dt>
                <dd className="whitespace-pre-wrap">{onboarding.workspaceAddress || "—"}</dd>
                {onboarding.workspaceWindows && onboarding.workspaceWindows.length > 0 ? (
                  <dd className="text-xs text-slate-600">{onboarding.workspaceWindows.join(", ")}</dd>
                ) : null}
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Tax acknowledgments</dt>
                <dd>
                  {formatDateTimeNy(onboarding.taxAckAt) || onboarding.taxAckAt || "—"}
                  {onboarding.taxEDelivery ? " · e-delivery yes" : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Payout</dt>
                <dd>
                  {onboarding.payoutMethod || "—"}
                  {onboarding.payoutBankName ? ` · ${onboarding.payoutBankName}` : ""}
                  {onboarding.payoutAccountLast4 ? ` · ****${onboarding.payoutAccountLast4}` : ""}
                  {onboarding.hasPayoutProof ? " · proof uploaded" : ""}
                  {onboarding.payoutSubmittedAt
                    ? ` · submitted ${formatDateTimeNy(onboarding.payoutSubmittedAt) || onboarding.payoutSubmittedAt}`
                    : ""}
                </dd>
              </div>
            </dl>
          ) : null}
          {wrapApp ? (
            <form action={actionForm} className="mt-4 flex flex-wrap items-end gap-2">
              <input type="hidden" name="appId" value={app.id} />
              <input type="hidden" name="role" value="wrapstar" />
              <input type="hidden" name="action" value="save_bg_status" />
              <input type="hidden" name="adminNotes" value={app.adminNotes || ""} />
              <label className="text-sm">
                Background status
                <select
                  name="bgStatus"
                  defaultValue={onboarding?.bgStatus || ""}
                  className="ml-2 rounded border px-2 py-1"
                >
                  <option value="">not started</option>
                  <option value="pending">pending</option>
                  <option value="clear">clear</option>
                  <option value="review">needs review</option>
                </select>
              </label>
              <button type="submit" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
                Save
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      <ApplicationReviewActions
        appId={app.id}
        status={app.status}
        suspended={app.suspended}
        adminNotes={app.adminNotes || ""}
        rejectReason={app.rejectReason || ""}
        role={role}
        action={actionForm}
        onboardingDone={steps.filter(([k, v]) => k !== "activation" && v).length}
        onboardingTotal={steps.filter(([k]) => k !== "activation").length}
        onboardingOpen={steps
          .filter(([k, v]) => k !== "activation" && !v)
          .map(([k]) => WRAPSTAR_ONBOARDING_STEP_LABELS[k] || k)}
        portalLastLoginAt={app.portalLastLoginAt}
        portalLoginCount={app.portalLoginCount}
        onboardingReopened={!!app.onboardingReopened}
        onboardingReopenedAt={app.onboardingReopenedAt}
      />
    </div>
  );
}
