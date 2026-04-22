/**
 * Single source for “Wrrapd delivery day” shown in emails, admin, and driver UIs.
 * When `amazonDeliveryDatesSnapshot` disagrees with stored `scheduledFor` (legacy rows),
 * use the same +1 @ 14:00 ET instant as transactional emails.
 */
import { formatDateKeyNy, scheduledForToIsoString } from "@/lib/ny-date";
import { wrrapdScheduledInstantFromAmazonDeliveryDateKey } from "@/lib/scheduling";

const YMD_SNAP = /^\d{4}-\d{2}-\d{2}$/;

export function pickAmazonYmdKeyForWrrapdSchedule(order: {
  amazonDeliveryDatesSnapshot?: string[];
  deliveryPreferenceChoice?: string;
}): string | undefined {
  const raw = order.amazonDeliveryDatesSnapshot;
  if (!raw?.length) return undefined;
  const snap = [...new Set(raw.map((x) => String(x).trim()).filter((k) => YMD_SNAP.test(k)))].sort();
  if (snap.length === 0) return undefined;
  if (snap.length === 1) return snap[0];
  const ch = order.deliveryPreferenceChoice;
  if (ch === "together" || ch === "together_deadline_default" || ch === "latest") return snap[snap.length - 1]!;
  if (ch === "earliest") return snap[0]!;
  // Default multi-date: align with checkout ingest (last Amazon day → Wrrapd +1).
  return snap[snap.length - 1]!;
}

/** ISO instant to use everywhere the thank-you / admin email uses the repaired Wrrapd day. */
export function wrrapdScheduledInstantIsoForUi(order: {
  scheduledFor: string | unknown;
  amazonDeliveryDatesSnapshot?: string[];
  deliveryPreferenceChoice?: string;
}): string {
  const scheduledIso =
    typeof order.scheduledFor === "string" && order.scheduledFor.trim()
      ? order.scheduledFor.trim()
      : scheduledForToIsoString(order.scheduledFor);
  const key = pickAmazonYmdKeyForWrrapdSchedule(order);
  if (!key) return scheduledIso || "";
  try {
    const expectedIso = wrrapdScheduledInstantFromAmazonDeliveryDateKey(key);
    if (formatDateKeyNy(order.scheduledFor) !== formatDateKeyNy(expectedIso)) {
      return expectedIso;
    }
  } catch {
    /* ignore bad snapshot keys */
  }
  return scheduledIso || "";
}
