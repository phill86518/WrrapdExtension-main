import { getOrderByDeliveryPreferenceToken } from "@/lib/data";
import { formatOrderScheduleEt } from "@/lib/email-templates/transactional";
import { formatInTimeZone } from "date-fns-tz";
import { submitDeliveryPreference } from "./actions";

export const dynamic = "force-dynamic";

const NY = "America/New_York";

export default async function DeliveryChoicePage({
  searchParams,
}: {
  searchParams?: Promise<{ t?: string; err?: string }>;
}) {
  const q = searchParams ? await searchParams : {};
  const token = q.t?.trim() ?? "";
  const err = q.err;

  if (!token) {
    return (
      <main className="mx-auto min-h-screen max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Invalid link</h1>
        <p className="mt-2 text-slate-600">Open the link from your Wrrapd email or text message.</p>
      </main>
    );
  }

  const order = await getOrderByDeliveryPreferenceToken(token);
  if (!order?.deliveryPreferencePending) {
    return (
      <main className="mx-auto min-h-screen max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Already updated</h1>
        <p className="mt-2 text-slate-600">
          This choice was already submitted or the deadline has passed. Your combined delivery schedule stays in
          effect unless you contacted support.
        </p>
      </main>
    );
  }

  const dates = order.amazonDeliveryDatesSnapshot ?? [];
  const deadline = order.deliveryPreferenceRespondBy
    ? formatInTimeZone(new Date(order.deliveryPreferenceRespondBy), NY, "EEEE, MMMM d, yyyy · h:mm a zzz")
    : "end of today (Eastern)";

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-12">
      <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-b from-amber-50 to-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-900/70">Wrrapd</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">How should we plan your visit?</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          Amazon shows <strong>different arrival dates</strong> for your gift-wrap items:{" "}
          <span className="whitespace-pre-wrap">{dates.join(", ")}</span>.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          Right now your Wrrapd delivery is set for{" "}
          <strong>{formatOrderScheduleEt(order.scheduledFor)}</strong> — that follows the{" "}
          <strong>last</strong> Amazon arrival (one combined trip).
        </p>
        <p className="mt-2 text-sm font-medium text-amber-950">
          Decide by <strong>{deadline}</strong>. If you do nothing, we keep the combined plan.
        </p>
        {err && (
          <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>
        )}
        <form action={submitDeliveryPreference} className="mt-6 space-y-4">
          <input type="hidden" name="token" value={token} />
          <label className="block text-sm font-medium text-slate-800">Your choice</label>
          <select
            name="choice"
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            defaultValue="together"
          >
            <option value="together">Keep one Wrrapd visit after the last Amazon shipment (combined)</option>
            <option value="earliest">
              Schedule Wrrapd as soon as possible after the first Amazon shipment (fastest)
            </option>
          </select>
          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Save my choice
          </button>
        </form>
      </div>
    </main>
  );
}
