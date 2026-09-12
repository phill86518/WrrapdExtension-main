export type WrapstarApplicationStatus =
  | "under_review"
  | "interview"
  | "approved"
  | "declined"
  | "rejected"
  | "active"
  | string;

export type WrapstarApplication = {
  id: number;
  applicationType?: "wrapstar";
  status: WrapstarApplicationStatus;
  suspended: boolean;
  fullName: string;
  firstName?: string;
  nickname?: string;
  greetingName?: string;
  lastName?: string;
  email: string;
  phoneMobile: string;
  phoneWork?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  canDeliver: string;
  hasVehicle: string;
  deliveryMaxDistance: string;
  cleanDrivingRecord: string;
  hasLargeFormatPrinter: string;
  printerSize: string;
  giftWrappingExperience: string;
  whyWrapstar: string;
  gigPlatforms: string;
  businessStructure: string;
  bankAccountReady: string;
  wrrapdPoDailyPickup: string;
  dedicatedWrapWorkspace: string;
  comfortableVideoMonitoring: string;
  deliveryProofReady: string;
  fitScore: number;
  fitScoreBreakdown: Record<string, number>;
  experienceRationale: string;
  commitmentRationale: string;
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
  onboarding?: {
    policiesSignedAt?: string;
    policiesSignature?: string;
    orientationScore?: string;
    bgLegalName?: string;
    bgOtherNames?: string;
    bgConsentAt?: string;
    bgStatus?: string;
    hasInsuranceFile?: boolean;
    insuranceCarrier?: string;
    insuranceExpires?: string;
    hasIdentitySelfie?: boolean;
    identityConfirmedAt?: string;
    workspaceAddress?: string;
    workspaceWindows?: string[];
    workspaceAccessNotes?: string;
    hasWorkspacePhoto?: boolean;
    taxAckAt?: string;
    taxEDelivery?: boolean;
    payoutMethod?: string;
    payoutHolderName?: string;
    payoutBankName?: string;
    payoutAccountType?: string;
    payoutRouting?: string;
    payoutAccountLast4?: string;
    hasPayoutProof?: boolean;
    payoutSubmittedAt?: string;
  };
  hasIdFile: boolean;
  submittedAt: string;
  approvedAt: string;
  inviteExpiresAt?: string;
  inviteExpiredAt?: string;
  activatedAt: string;
  interviewAt: string;
  interviewSkipped?: boolean;
  interviewSkippedAt?: string;
  userId: number;
  createdAt: string;
};

/**
 * WordPress ops base. Prefer the api.wrrapd.com bridge (VM) — SiteGround often blocks
 * direct Cloud Run → apply.wrrapd.com calls, which made Applications look empty.
 */
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
      "WRRAPD_WRAPSTARS_OPS_API_KEY is not set on the tracking platform (must match WordPress WRRAPD_WRAPSTARS_OPS_API_KEY)",
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

export async function listWrapstarApplications(
  status?: string,
  search?: string,
): Promise<WrapstarApplication[]> {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (search && search.trim()) params.set("q", search.trim());
  const qs = params.toString();
  const r = await fetch(`${wpBase()}/wp-json/wrrapd/v1/applications${qs ? `?${qs}` : ""}`, {
    headers: opsHeaders(),
    cache: "no-store",
  });
  const body = await parseJson(r);
  let apps = Array.isArray(body.applications)
    ? (body.applications as WrapstarApplication[])
    : [];
  apps = apps.map((a) => ({ ...a, applicationType: "wrapstar" as const }));
  // Client-side filter too (works even before SiteGround ops-api search is updated).
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

export async function getWrapstarApplication(id: number): Promise<WrapstarApplication> {
  const r = await fetch(`${wpBase()}/wp-json/wrrapd/v1/applications/${id}`, {
    headers: opsHeaders(),
    cache: "no-store",
  });
  const body = await parseJson(r);
  if (!body.application || typeof body.application !== "object") {
    throw new Error("Application not found");
  }
  return body.application as WrapstarApplication;
}

export type ApplicationAction =
  | "interview"
  | "approve"
  | "approve_without_interview"
  | "reject"
  | "activate"
  | "suspend"
  | "unsuspend"
  | "mark_declined"
  | "reinvite"
  | "resend_invite"
  | "reset_to_review"
  | "save_notes"
  | "save_bg_status";

export async function runWrapstarApplicationAction(
  id: number,
  action: ApplicationAction,
  opts?: { adminNotes?: string; rejectReason?: string; bgStatus?: string },
): Promise<{ application: WrapstarApplication; passwordIssued?: boolean }> {
  const payload: Record<string, string> = { action };
  if (opts?.adminNotes !== undefined) payload.adminNotes = opts.adminNotes;
  if (opts?.rejectReason !== undefined) payload.rejectReason = opts.rejectReason;
  if (opts?.bgStatus !== undefined) payload.bgStatus = opts.bgStatus;

  const r = await fetch(`${wpBase()}/wp-json/wrrapd/v1/applications/${id}/action`, {
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
    application: body.application as WrapstarApplication,
    passwordIssued: result?.passwordIssued,
  };
}
