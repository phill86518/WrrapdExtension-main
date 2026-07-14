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
  status: WrapstarApplicationStatus;
  suspended: boolean;
  fullName: string;
  firstName?: string;
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
  mustChangePassword?: boolean;
  onboardingStep: string;
  onboardingStepsComplete: Record<string, boolean>;
  hasIdFile: boolean;
  submittedAt: string;
  approvedAt: string;
  activatedAt: string;
  interviewAt: string;
  userId: number;
  createdAt: string;
};

function wpBase(): string {
  return (
    process.env.WRRAPD_WRAPSTARS_WP_BASE_URL ||
    process.env.WRRAPD_WRAPSTARS_APPLY_URL ||
    "https://apply.wrrapd.com"
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
): Promise<WrapstarApplication[]> {
  const q = status && status !== "all" ? `?status=${encodeURIComponent(status)}` : "";
  const r = await fetch(`${wpBase()}/wp-json/wrrapd/v1/applications${q}`, {
    headers: opsHeaders(),
    cache: "no-store",
  });
  const body = await parseJson(r);
  const apps = body.applications;
  return Array.isArray(apps) ? (apps as WrapstarApplication[]) : [];
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
  | "reject"
  | "activate"
  | "suspend"
  | "unsuspend"
  | "mark_declined"
  | "save_notes";

export async function runWrapstarApplicationAction(
  id: number,
  action: ApplicationAction,
  opts?: { adminNotes?: string; rejectReason?: string },
): Promise<{ application: WrapstarApplication; passwordIssued?: boolean }> {
  const payload: Record<string, string> = { action };
  if (opts?.adminNotes !== undefined) payload.adminNotes = opts.adminNotes;
  if (opts?.rejectReason !== undefined) payload.rejectReason = opts.rejectReason;

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
