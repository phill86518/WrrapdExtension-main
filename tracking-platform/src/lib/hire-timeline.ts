import { formatDateTimeNy, toInstantDate } from "./ny-date";

export type HireStampKey =
  | "submittedAt"
  | "createdAt"
  | "interviewAt"
  | "interviewSkippedAt"
  | "approvedAt"
  | "inviteSentAt"
  | "inviteExpiresAt"
  | "inviteExpiredAt"
  | "activatedAt"
  | "rejectedAt"
  | "declinedAt"
  | "previousDeclinedAt"
  | "reinvitedAt"
  | "suspendedAt"
  | "unsuspendedAt"
  | "notesUpdatedAt"
  | "resetAt";

export type HireStamps = Partial<Record<HireStampKey, string | undefined | null>>;

export const HIRE_TIMELINE_LABELS: { key: HireStampKey; label: string }[] = [
  { key: "submittedAt", label: "Application submitted" },
  { key: "createdAt", label: "Record created" },
  { key: "interviewAt", label: "Interview requested" },
  { key: "interviewSkippedAt", label: "Interview skipped" },
  { key: "approvedAt", label: "Approved" },
  { key: "inviteSentAt", label: "Login invite sent" },
  { key: "inviteExpiresAt", label: "Invite expires" },
  { key: "inviteExpiredAt", label: "Invite expired" },
  { key: "activatedAt", label: "Activated" },
  { key: "rejectedAt", label: "Rejected" },
  { key: "declinedAt", label: "Offer declined" },
  { key: "previousDeclinedAt", label: "Previous decline" },
  { key: "reinvitedAt", label: "Reinvited" },
  { key: "suspendedAt", label: "Suspended" },
  { key: "unsuspendedAt", label: "Unsuspended" },
  { key: "notesUpdatedAt", label: "Notes updated" },
  { key: "resetAt", label: "Reset to review" },
];

export type HireTimelineRow = { key: HireStampKey; label: string; value: string; iso: string };

export function hireTimelineRows(stamps: HireStamps): HireTimelineRow[] {
  const rows: HireTimelineRow[] = [];
  for (const { key, label } of HIRE_TIMELINE_LABELS) {
    const iso = String(stamps[key] || "").trim();
    if (!iso) continue;
    if (key === "createdAt" && stamps.submittedAt) {
      const a = toInstantDate(stamps.submittedAt).getTime();
      const b = toInstantDate(iso).getTime();
      if (!Number.isNaN(a) && !Number.isNaN(b) && Math.abs(a - b) < 120_000) continue;
    }
    const value = formatDateTimeNy(iso);
    if (!value) continue;
    rows.push({ key, label, value, iso });
  }
  return rows;
}

const LATEST_KEYS: HireStampKey[] = [
  "resetAt",
  "unsuspendedAt",
  "suspendedAt",
  "reinvitedAt",
  "activatedAt",
  "rejectedAt",
  "declinedAt",
  "approvedAt",
  "interviewSkippedAt",
  "interviewAt",
  "inviteSentAt",
  "submittedAt",
];

export function latestHireAction(stamps: HireStamps): HireTimelineRow | null {
  const labels = Object.fromEntries(HIRE_TIMELINE_LABELS.map((r) => [r.key, r.label])) as Record<
    HireStampKey,
    string
  >;
  let best: HireTimelineRow | null = null;
  let bestMs = -1;
  for (const key of LATEST_KEYS) {
    const iso = String(stamps[key] || "").trim();
    if (!iso) continue;
    const ms = toInstantDate(iso).getTime();
    if (Number.isNaN(ms) || ms < bestMs) continue;
    const value = formatDateTimeNy(iso);
    if (!value) continue;
    bestMs = ms;
    best = { key, label: labels[key] || key, value, iso };
  }
  return best;
}
