import { addDays, addMonths } from "date-fns";
import { formatInTimeZone, toDate } from "date-fns-tz";

const NY = "America/New_York";

export function nowInNy(): Date {
  return toDate(new Date(), { timeZone: NY });
}

export function formatDateKeyNy(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return formatInTimeZone(d, NY, "yyyy-MM-dd");
}

export function hourNy(iso: string | Date): number {
  const d = typeof iso === "string" ? new Date(iso) : iso;
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
  return formatInTimeZone(toDate(`${dateKey}T12:00:00`, { timeZone: NY }), NY, "EEE MMM d, yyyy");
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
