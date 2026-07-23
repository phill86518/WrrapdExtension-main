import type { ApplicationAction } from "./wrapstar-applications-admin";

export type DriverApplicationStatus =
  | "under_review"
  | "interview"
  | "approved"
  | "declined"
  | "rejected"
  | "active"
  | string;

export type DriverApplication = {
  id: number;
  applicationType: "driver";
  status: DriverApplicationStatus;
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
  age21?: string;
  hasValidLicense?: string;
  hasVehicle: string;
  vehicleType?: string;
  hasSmartphone?: string;
  cleanDrivingRecord: string;
  availability?: string;
  whyDrive?: string;
  deliveryExperience?: string;
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
  inviteExpiresAt?: string;
  inviteExpiredAt?: string;
  activatedAt: string;
  interviewAt: string;
  userId: number;
  createdAt: string;
  /** Compat with WrapStar UI fields */
  canDeliver?: string;
  fitScore?: number;
  whyWrapstar?: string;
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

export async function listDriverApplications(
  status?: string,
  search?: string,
): Promise<DriverApplication[]> {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (search && search.trim()) params.set("q", search.trim());
  const qs = params.toString();
  const r = await fetch(
    `${wpBase()}/wp-json/wrrapd/v1/driver-applications${qs ? `?${qs}` : ""}`,
    {
      headers: opsHeaders(),
      cache: "no-store",
    },
  );
  const body = await parseJson(r);
  let apps = Array.isArray(body.applications)
    ? (body.applications as DriverApplication[])
    : [];
  apps = apps.map((a) => ({ ...a, applicationType: "driver" as const }));
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

export async function getDriverApplication(id: number): Promise<DriverApplication> {
  const r = await fetch(`${wpBase()}/wp-json/wrrapd/v1/driver-applications/${id}`, {
    headers: opsHeaders(),
    cache: "no-store",
  });
  const body = await parseJson(r);
  if (!body.application || typeof body.application !== "object") {
    throw new Error("Driver application not found");
  }
  return { ...(body.application as DriverApplication), applicationType: "driver" };
}

export async function runDriverApplicationAction(
  id: number,
  action: ApplicationAction,
  opts?: { adminNotes?: string; rejectReason?: string },
): Promise<{ application: DriverApplication; passwordIssued?: boolean }> {
  const payload: Record<string, string> = { action };
  if (opts?.adminNotes !== undefined) payload.adminNotes = opts.adminNotes;
  if (opts?.rejectReason !== undefined) payload.rejectReason = opts.rejectReason;

  const r = await fetch(`${wpBase()}/wp-json/wrrapd/v1/driver-applications/${id}/action`, {
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
    application: {
      ...(body.application as DriverApplication),
      applicationType: "driver",
    },
    passwordIssued: result?.passwordIssued,
  };
}
