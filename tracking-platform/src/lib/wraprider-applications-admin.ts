import type { ApplicationAction } from "./wrapstar-applications-admin";

/**
 * WrapRider applications — the THIRD hire track. Own WordPress CPT (`wrrapd_wraprider_app`),
 * own apply form (apply.wrrapd.com/wraprider/apply/), own onboarding portal
 * (pros.wrrapd.com/wraprider-onboarding/), own ops routes (`/wrrapd/v1/wraprider-applications`).
 *
 * Never read from or written to the WrapStar or JoyRider CPTs.
 */

export type WrapriderApplicationStatus =
  | "under_review"
  | "interview"
  | "approved"
  | "declined"
  | "rejected"
  | "active"
  | string;

export type WrapriderApplication = {
  id: number;
  applicationType: "wraprider";
  status: WrapriderApplicationStatus;
  suspended: boolean;
  fullName: string;
  firstName?: string;
  nickname?: string;
  greetingName?: string;
  lastName?: string;
  email: string;
  phoneMobile: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  /* Delivery side */
  age21?: string;
  hasValidLicense?: string;
  hasVehicle: string;
  vehicleType?: string;
  hasSmartphone?: string;
  cleanDrivingRecord: string;
  deliveryMaxDistance?: string;
  availability?: string;
  deliveryExperience?: string;
  /* Wrap side */
  giftWrappingExperience?: string;
  dedicatedWrapWorkspace?: string;
  hasLargeFormatPrinter?: string;
  printerSize?: string;
  comfortableVideoMonitoring?: string;
  workspaceAddress?: string;
  workspaceNotes?: string;
  workspaceConfirmedAt?: string;
  orientationScore?: string;
  hasInsuranceFile?: boolean;
  whyWraprider?: string;
  bankAccountReady: string;
  adminNotes: string;
  rejectReason: string;
  declineNote?: string;
  declinedAt?: string;
  previousDeclinedAt?: string;
  reinvitedAt?: string;
  reinviteCount?: number;
  mustChangePassword?: boolean;
  onboardingStep: string;
  onboardingStepsComplete: Record<string, boolean>;
  hasIdFile: boolean;
  submittedAt: string;
  approvedAt: string;
  inviteSentAt?: string;
  inviteExpiresAt?: string;
  inviteExpiredAt?: string;
  activatedAt: string;
  interviewAt: string;
  interviewSkipped?: boolean;
  interviewSkippedAt?: string;
  rejectedAt?: string;
  suspendedAt?: string;
  unsuspendedAt?: string;
  notesUpdatedAt?: string;
  resetAt?: string;
  passwordChangedAt?: string;
  /** Last sign-in on either contractor app (via WP portal-auth) */
  portalLastLoginAt?: string;
  portalLoginCount?: number;
  onboardingReopened?: boolean;
  onboardingReopenedAt?: string;
  onboardingClosedAt?: string;
  userId: number;
  createdAt: string;
  /** Compat with shared UI fields */
  canDeliver?: string;
  fitScore?: number;
  whyWrapstar?: string;
  whyDrive?: string;
};

function wpBase(): string {
  return (
    process.env.WRRAPD_WRAPSTARS_WP_BASE_URL ||
    process.env.WRRAPD_WRAPSTARS_APPLY_URL ||
    "https://api.wrrapd.com/api/wrapstars-wp-bridge"
  ).replace(/\/$/, "");
}

function opsKey(): string {
  const key = (process.env.WRRAPD_WRAPSTARS_OPS_API_KEY || "").trim();
  if (!key) {
    throw new Error(
      "WRRAPD_WRAPSTARS_OPS_API_KEY is not set on the tracking platform (must match WordPress)",
    );
  }
  return key;
}

function opsHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Wrrapd-Wrapstars-Ops-Key": opsKey(),
  };
}

async function parseJson(r: Response): Promise<Record<string, unknown>> {
  const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    const msg =
      typeof body.message === "string"
        ? body.message
        : typeof body.error === "string"
          ? body.error
          : `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return body;
}

function tag(a: WrapriderApplication): WrapriderApplication {
  return { ...a, applicationType: "wraprider", canDeliver: "yes" };
}

export async function listWrapriderApplications(
  status?: string,
  search?: string,
): Promise<WrapriderApplication[]> {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (search && search.trim()) params.set("q", search.trim());
  const qs = params.toString();
  const r = await fetch(
    `${wpBase()}/wp-json/wrrapd/v1/wraprider-applications${qs ? `?${qs}` : ""}`,
    {
      headers: opsHeaders(),
      cache: "no-store",
    },
  );
  const body = await parseJson(r);
  let apps = Array.isArray(body.applications)
    ? (body.applications as WrapriderApplication[]).map(tag)
    : [];
  if (search && search.trim()) {
    const needle = search.trim().toLowerCase();
    apps = apps.filter((a) => {
      const hay = [a.fullName, a.email, a.phoneMobile, a.city, String(a.id)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }
  return apps;
}

export async function getWrapriderApplication(id: number): Promise<WrapriderApplication> {
  const r = await fetch(`${wpBase()}/wp-json/wrrapd/v1/wraprider-applications/${id}`, {
    headers: opsHeaders(),
    cache: "no-store",
  });
  const body = await parseJson(r);
  if (!body.application || typeof body.application !== "object") {
    throw new Error("WrapRider application not found");
  }
  return tag(body.application as WrapriderApplication);
}

export async function runWrapriderApplicationAction(
  id: number,
  action: ApplicationAction,
  opts?: { adminNotes?: string; rejectReason?: string },
): Promise<{ application: WrapriderApplication; passwordIssued?: boolean }> {
  const payload: Record<string, string> = { action };
  if (opts?.adminNotes !== undefined) payload.adminNotes = opts.adminNotes;
  if (opts?.rejectReason !== undefined) payload.rejectReason = opts.rejectReason;

  const r = await fetch(`${wpBase()}/wp-json/wrrapd/v1/wraprider-applications/${id}/action`, {
    method: "POST",
    headers: opsHeaders(),
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const body = await parseJson(r);
  if (!body.application || typeof body.application !== "object") {
    throw new Error("Action succeeded but application missing in response");
  }
  const result = body.result as { passwordIssued?: boolean } | undefined;
  return {
    application: tag(body.application as WrapriderApplication),
    passwordIssued: result?.passwordIssued,
  };
}
