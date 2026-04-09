import { formatInTimeZone, toDate } from "date-fns-tz";

const NY = "America/New_York";

export function nowInNy(): Date {
  return toDate(new Date(), { timeZone: NY });
}

export function formatDateKeyNy(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return formatInTimeZone(d, NY, "yyyy-MM-dd");
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
