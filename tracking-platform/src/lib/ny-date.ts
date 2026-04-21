import { addDays, addMonths } from "date-fns";
import { formatInTimeZone, toDate } from "date-fns-tz";

const NY = "America/New_York";

export function nowInNy(): Date {
  return toDate(new Date(), { timeZone: NY });
}

function numericFromFirestoreField(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/** Normalize Firestore Timestamp, ISO string, or Date for Eastern calendar keys. */
export function toInstantDate(value: unknown): Date {
  if (value == null) return new Date(NaN);
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.toDate === "function") {
      try {
        const d = (o.toDate as () => Date)();
        if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
      } catch {
        /* fall through */
      }
    }
    const sec = numericFromFirestoreField(o.seconds ?? o._seconds);
    if (sec != null) {
      const nsRaw = o.nanoseconds ?? o._nanoseconds;
      const ns = numericFromFirestoreField(nsRaw) ?? 0;
      return new Date(sec * 1000 + ns / 1e6);
    }
  }
  return new Date(NaN);
}

/**
 * Stable ISO string for `scheduledFor` when passing orders from Server Components to the client.
 * Firestore Timestamps often JSON-serialize to `{ seconds, nanoseconds }` without `toDate()`.
 */
export function scheduledForToIsoString(value: unknown): string {
  const d = toInstantDate(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

export function formatDateKeyNy(iso: string | Date | unknown): string {
  const d = toInstantDate(iso);
  if (Number.isNaN(d.getTime())) return "";
  return formatInTimeZone(d, NY, "yyyy-MM-dd");
}

export function hourNy(iso: string | Date | unknown): number {
  const d = toInstantDate(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Number.parseInt(formatInTimeZone(d, NY, "H"), 10);
}

export function startOfCalendarDayNyMs(dateKey: string): number {
  const s = `${dateKey}T00:00:00`;
  return toDate(s, { timeZone: NY }).getTime();
}

export function isPastCalendarDayNy(dateKey: string, now: Date = new Date()): boolean {
  const todayKey = formatDateKeyNy(now);
  return dateKey < todayKey;
}

/** True if instant is before start of today in NY (cannot schedule in the past). */
export function isScheduledInstantInPastNy(iso: string, now: Date = new Date()): boolean {
  const t = new Date(iso).getTime();
  const todayKey = formatDateKeyNy(now);
  const startToday = startOfCalendarDayNyMs(todayKey);
  return t < startToday;
}

/** Human label for a calendar day in Eastern (e.g. Wed Apr 23, 2026). */
export function calendarDayLabelNy(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  return formatInTimeZone(toDate(`${dateKey}T12:00:00`, { timeZone: NY }), NY, "EEE MMM d, yyyy");
}

/** First Eastern day to show in driver queue: today if there are stops today, else earliest assigned day. */
export function initialDriverDayKeyNy(
  todayNyKey: string,
  orders: { scheduledFor: string | unknown }[],
): string {
  const keys = [
    ...new Set(orders.map((o) => formatDateKeyNy(o.scheduledFor)).filter((k) => k.length > 0)),
  ].sort();
  if (keys.length === 0) return todayNyKey;
  if (keys.includes(todayNyKey)) return todayNyKey;
  return keys[0]!;
}

/** All `yyyy-MM-dd` keys for days in that Eastern calendar month (`yyyy-MM`). */
export function listDateKeysInNyMonth(ym: string): string[] {
  const start = toDate(`${ym}-01T12:00:00`, { timeZone: NY });
  const keys: string[] = [];
  let cur = start;
  for (let i = 0; i < 35; i++) {
    const key = formatInTimeZone(cur, NY, "yyyy-MM-dd");
    if (key.slice(0, 7) !== ym) break;
    keys.push(key);
    cur = addDays(cur, 1);
  }
  return keys;
}

/** Eastern `yyyy-MM` for the month containing `dateKey`. */
export function nyMonthContainingDateKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function shiftNyMonthYm(ym: string, delta: number): string {
  const anchor = toDate(`${ym}-15T12:00:00`, { timeZone: NY });
  const shifted = addMonths(anchor, delta);
  return formatInTimeZone(shifted, NY, "yyyy-MM");
}
