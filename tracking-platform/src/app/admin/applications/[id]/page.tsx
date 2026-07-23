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
  if (!id || !action) return;

  const current =
    role === "driver" ? await getDriverApplication(id) : await getWrapstarApplication(id);
  const st = current.status;
  if (action === "approve" && !["under_review", "interview"].includes(st)) {
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
  const steps = Object.entries(app.onboardingStepsComplete || {});

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
          {isDriver ? "Driver" : "WrapStar"}
        </span>{" "}
        · <span className="font-medium">{app.status}</span>
        {app.suspended ? " · SUSPENDED" : ""}
        {!isDriver && "fitScore" in app && app.fitScore ? ` · Fit ${app.fitScore}/100` : ""}
        {app.greetingName ? ` · Greets as “${app.greetingName}”` : ""}
      </p>

      {okFlash ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Action completed: <strong>{okFlash}</strong>
          {okFlash === "approve"
            ? " — welcome email sent with username, temporary password, and a Decline link."
            : null}
          {okFlash === "activate"
            ? isDriver
              ? " — added/updated on Drivers ops roster for courier assignment."
              : " — added/updated on WrapStars ops roster for Command Center assignment."
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
          <p className="mt-2 text-sm">
            {app.addressLine1}
            {app.addressLine2 ? `, ${app.addressLine2}` : ""}
            <br />
            {app.city}, {app.state} {app.postalCode}
          </p>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">{isDriver ? "Driver profile" : "Capability"}</h2>
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
          ) : (
            <>
              <p className="mt-2 text-sm">
                Deliver: <strong>{"canDeliver" in app ? app.canDeliver || "—" : "—"}</strong>
              </p>
              <p className="text-sm">
                Vehicle: {"hasVehicle" in app ? app.hasVehicle || "n/a" : "n/a"}
              </p>
              <p className="text-sm">
                Driving record:{" "}
                {"cleanDrivingRecord" in app ? app.cleanDrivingRecord || "n/a" : "n/a"}
              </p>
            </>
          )}
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
              Invitation expires {new Date(app.inviteExpiresAt).toLocaleString()}
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
        role={role}
        action={actionForm}
      />
    </div>
  );
}
