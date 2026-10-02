import { addDays, format } from "date-fns";
import { formatInTimeZone, toDate } from "date-fns-tz";

const NY = "America/New_York";

export type PayWeek = {
  /** Friday YYYY-MM-DD Eastern. */
  startKey: string;
  /** Thursday YYYY-MM-DD Eastern. */
  endKey: string;
  /** Thursday 6:00pm Eastern, when Stripe payouts are sent. */
  payoutAtIso: string;
};

/** Pay week is Friday 00:00 through the following Thursday. Payout is that Thursday at 6:00pm Eastern. */
export function payWeekContaining(now: Date = new Date()): PayWeek {
  const key = formatInTimeZone(now, NY, "yyyy-MM-dd");
  const noon = toDate(`${key}T12:00:00`, { timeZone: NY });
  const weekday = Number(formatInTimeZone(noon, NY, "i")); // 1 Mon … 5 Fri … 7 Sun
  const daysSinceFriday = (weekday + 2) % 7;
  const start = addDays(noon, -daysSinceFriday);
  const end = addDays(start, 6);
  const startKey = format(start, "yyyy-MM-dd");
  const endKey = format(end, "yyyy-MM-dd");
  const payoutAtIso = toDate(`${endKey}T18:00:00`, { timeZone: NY }).toISOString();
  return { startKey, endKey, payoutAtIso };
}

export function payWeekId(week: PayWeek, contractorId: string): string {
  return `${week.startKey}_${contractorId}`;
}

/** Twelve finished gifts = one paid hour, with a one-hour floor once any gift is finished. */
export function paidWrapHours(finishedGifts: number): number {
  const n = Math.max(0, Math.floor(finishedGifts));
  if (n <= 0) return 0;
  return Math.max(1, n / 12);
}

/** Each commenced delivery window pays at least one hour. Longer windows pay the elapsed time. */
export function paidDeliveryHours(elapsedHours: number): number {
  if (!Number.isFinite(elapsedHours) || elapsedHours <= 0) return 1;
  return Math.max(1, elapsedHours);
}

export function amountCentsForHours(hours: number, hourlyRateCents: number): number {
  if (hours <= 0 || hourlyRateCents <= 0) return 0;
  return Math.round(hours * hourlyRateCents);
}
