import { addDays, formatISO, parseISO } from "date-fns";
import { formatInTimeZone, toDate } from "date-fns-tz";
import { isScheduledInstantInPastNy } from "./ny-date";

const NY = "America/New_York";

/** Production rule: Amazon promised delivery date + 1 calendar day (same rough time). */
export function amazonShipDayPlusOnePlaceholder(amazonDeliveryDayIso: string): string {
  const base = parseISO(amazonDeliveryDayIso);
  const next = addDays(base, 1);
  return formatISO(next);
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Amazon-shown **calendar** delivery date in Eastern (`YYYY-MM-DD`) → Wrrapd calendar day = next day,
 * route anchor **14:00 America/New_York** (afternoon shift / start of route window).
 */
/** End of calendar day (23:59:59.999) America/New_York for the date that `reference` falls on in that zone. */
export function endOfCalendarDayAmericaNewYorkIso(reference: Date = new Date()): string {
  const dayKey = formatInTimeZone(reference, NY, "yyyy-MM-dd");
  return toDate(`${dayKey}T23:59:59.999`, { timeZone: NY }).toISOString();
}

export function wrrapdScheduledInstantFromAmazonDeliveryDateKey(amazonDateKey: string): string {
  const key = amazonDateKey.trim();
  if (!YMD.test(key)) {
    throw new Error(`Invalid amazonDeliveryDay (expected YYYY-MM-DD): ${amazonDateKey}`);
  }
  const amazonNoonNy = toDate(`${key}T12:00:00`, { timeZone: NY });
  const wrrapdCal = addDays(amazonNoonNy, 1);
  const wrrapdYmd = formatInTimeZone(wrrapdCal, NY, "yyyy-MM-dd");
  const startNy = toDate(`${wrrapdYmd}T14:00:00`, { timeZone: NY });
  return formatISO(startNy);
}

/** Test phase: tomorrow, day after, day after that — 7:24 PM local NY for parity with existing demo. */
export function getNextThreeDemoScheduleInstants(now: Date = new Date()): string[] {
  const todayKey = formatInTimeZone(now, NY, "yyyy-MM-dd");
  const base = toDate(`${todayKey}T19:24:00`, { timeZone: NY });
  return [1, 2, 3].map((d) => formatISO(addDays(base, d)));
}

/** Interpret admin `datetime-local` (no TZ) as America/New_York wall time. */
export function parseScheduledForInput(raw: string): Date {
  const s = raw.trim();
  if (!s) return new Date(NaN);
  if (s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s)) {
    return new Date(s);
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return new Date(NaN);
  const sec = m[4] ?? "00";
  const wall = `${m[1]}T${m[2]}:${m[3]}:${sec}`;
  return toDate(wall, { timeZone: NY });
}

export function validateScheduledForNotPast(iso: string): { ok: true } | { ok: false; message: string } {
  if (isScheduledInstantInPastNy(iso)) {
    return { ok: false, message: "Scheduled time cannot be on a past calendar day (Eastern)." };
  }
  return { ok: true };
}

/** Reject instants in the past (with small clock skew tolerance). */
export function validateScheduledInstant(scheduledAt: Date): { ok: true } | { ok: false; message: string } {
  if (Number.isNaN(scheduledAt.getTime())) {
    return { ok: false, message: "Invalid schedule date/time." };
  }
  const skewMs = 60_000;
  if (scheduledAt.getTime() < Date.now() - skewMs) {
    return { ok: false, message: "Scheduled time cannot be in the past." };
  }
  const iso = scheduledAt.toISOString();
  return validateScheduledForNotPast(iso);
}

/** `datetime-local` value uses local browser TZ; min should be start of today in user's TZ — handled in UI. Server still validates NY rule. */
export function minDatetimeLocalValue(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  return `${y}-${m}-${d}T00:00`;
}
