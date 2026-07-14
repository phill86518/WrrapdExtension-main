"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

const BTN =
  "rounded px-3 py-2 text-sm cursor-pointer transition disabled:cursor-not-allowed disabled:opacity-45 disabled:pointer-events-none";

function Spent({ children }: { children: ReactNode }) {
  return (
    <span
      className={`${BTN} border border-slate-200 bg-slate-100 font-medium text-slate-500`}
      aria-disabled="true"
      title="Already completed — not available again"
    >
      {children}
    </span>
  );
}

type Props = {
  appId: number;
  status: string;
  suspended: boolean;
  adminNotes: string;
  rejectReason: string;
  action: (formData: FormData) => Promise<void>;
};

export function ApplicationReviewActions({
  appId,
  status,
  suspended,
  adminNotes,
  rejectReason,
  action,
}: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const busy = pending !== null;

  const pastInterview = ["interview", "approved", "active", "declined", "rejected"].includes(status);
  const pastApprove = ["approved", "active", "declined"].includes(status);
  const pastReject = status === "rejected";
  const pastActivate = status === "active";

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold">Review actions</h2>
      <form
        action={action}
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          const next = submitter?.value || "working";
          setPending(next);
        }}
      >
        <input type="hidden" name="appId" value={appId} />
        <label className="block text-sm">
          Reviewer notes
          <textarea
            name="adminNotes"
            rows={3}
            defaultValue={adminNotes || ""}
            className="mt-1 w-full cursor-text rounded border px-3 py-2"
            disabled={busy}
          />
        </label>
        {(status === "under_review" || status === "interview") && (
          <label className="block text-sm">
            Reject reason (required for Reject)
            <textarea
              name="rejectReason"
              rows={2}
              defaultValue={rejectReason || ""}
              className="mt-1 w-full cursor-text rounded border px-3 py-2"
              placeholder="Shown in the rejection email"
              disabled={busy}
            />
          </label>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="action"
            value="save_notes"
            disabled={busy}
            className={`${BTN} border border-slate-300 bg-white hover:bg-slate-50`}
          >
            {pending === "save_notes" ? "Saving…" : "Save notes"}
          </button>

          {/* Spent one-shot actions stay visible but dimmed after use */}
          {pastInterview && status !== "under_review" ? (
            <Spent>✓ Zoom interview requested</Spent>
          ) : null}
          {pastApprove ? <Spent>✓ Approved for onboarding</Spent> : null}
          {pastReject ? <Spent>✓ Rejected</Spent> : null}
          {pastActivate ? <Spent>✓ Activated (live)</Spent> : null}

          {status === "under_review" ? (
            <>
              <button
                type="submit"
                name="action"
                value="interview"
                disabled={busy}
                className={`${BTN} bg-sky-700 text-white hover:bg-sky-800`}
              >
                {pending === "interview" ? "Sending…" : "Request Zoom interview"}
              </button>
              <button
                type="submit"
                name="action"
                value="approve"
                disabled={busy}
                className={`${BTN} bg-indigo-700 font-semibold text-white hover:bg-indigo-800`}
              >
                {pending === "approve" ? "Approving…" : "Approve for onboarding"}
              </button>
              <button
                type="submit"
                name="action"
                value="reject"
                disabled={busy}
                className={`${BTN} bg-rose-700 text-white hover:bg-rose-800`}
              >
                {pending === "reject" ? "Rejecting…" : "Reject"}
              </button>
            </>
          ) : null}

          {status === "interview" ? (
            <>
              <button
                type="submit"
                name="action"
                value="approve"
                disabled={busy}
                className={`${BTN} bg-indigo-700 font-semibold text-white hover:bg-indigo-800`}
              >
                {pending === "approve" ? "Approving…" : "Passed interview — approve"}
              </button>
              <button
                type="submit"
                name="action"
                value="reject"
                disabled={busy}
                className={`${BTN} bg-rose-700 text-white hover:bg-rose-800`}
              >
                {pending === "reject" ? "Rejecting…" : "Reject"}
              </button>
            </>
          ) : null}

          {status === "declined" ? (
            <button
              type="submit"
              name="action"
              value="reinvite"
              disabled={busy}
              className={`${BTN} bg-indigo-700 font-semibold text-white hover:bg-indigo-800`}
            >
              {pending === "reinvite" ? "Re-opening…" : "Re-open invitation & resend welcome email"}
            </button>
          ) : null}

          {status === "approved" ? (
            <>
              <button
                type="submit"
                name="action"
                value="activate"
                disabled={busy}
                className={`${BTN} bg-emerald-700 font-semibold text-white hover:bg-emerald-800`}
              >
                {pending === "activate" ? "Activating…" : "Activate WrapStar (live)"}
              </button>
              <button
                type="submit"
                name="action"
                value="resend_invite"
                disabled={busy}
                className={`${BTN} bg-sky-700 text-white hover:bg-sky-800`}
              >
                {pending === "resend_invite" ? "Sending…" : "Resend welcome email"}
              </button>
              <button
                type="submit"
                name="action"
                value="mark_declined"
                disabled={busy}
                className={`${BTN} bg-orange-700 text-white hover:bg-orange-800`}
              >
                {pending === "mark_declined" ? "Updating…" : "Mark as declined offer"}
              </button>
            </>
          ) : null}

          {status === "active" && !suspended ? (
            <button
              type="submit"
              name="action"
              value="suspend"
              disabled={busy}
              className={`${BTN} bg-amber-700 text-white hover:bg-amber-800`}
            >
              {pending === "suspend" ? "Suspending…" : "Suspend"}
            </button>
          ) : null}

          {suspended ? (
            <button
              type="submit"
              name="action"
              value="unsuspend"
              disabled={busy}
              className={`${BTN} bg-slate-800 text-white hover:bg-slate-900`}
            >
              {pending === "unsuspend" ? "Updating…" : "Unsuspend"}
            </button>
          ) : null}

          {["approved", "declined", "interview", "rejected"].includes(status) ? (
            <button
              type="submit"
              name="action"
              value="reset_to_review"
              disabled={busy}
              className={`${BTN} border border-slate-400 bg-slate-50 text-slate-800 hover:bg-slate-100`}
              title="Testing: return this application to Under review so Approve can be tried again"
            >
              {pending === "reset_to_review" ? "Resetting…" : "Reset to under review (test)"}
            </button>
          ) : null}
        </div>
      </form>
      <p className="mt-3 text-xs text-slate-500">
        One-shot actions (approve, reject, interview, activate) dim after use and cannot run again from
        that state. Approve / re-invite emails username, a fresh temporary password, login link, and a
        Decline link. Declined offers live under{" "}
        <Link className="cursor-pointer underline" href="/admin/applications?status=declined">
          Declined offer
        </Link>
        .
      </p>
    </section>
  );
}
