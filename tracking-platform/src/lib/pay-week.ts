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

/** The Friday–Thursday week immediately before `week`. */
export function previousPayWeek(week: PayWeek): PayWeek {
  const start = toDate(`${week.startKey}T12:00:00`, { timeZone: NY });
  return payWeekContaining(addDays(start, -1));
}

/**
 * The week that may be sent now.
 * Thursday 6:00pm Eastern or later: this week.
 * Before that: last week, so an early click cannot freeze the week that is still open.
 */
export function payableWeek(now: Date = new Date()): PayWeek {
  const current = payWeekContaining(now);
  if (now.getTime() >= new Date(current.payoutAtIso).getTime()) return current;
  return previousPayWeek(current);
}

/** WrapStar floor: a started window with finished gifts pays at least half an hour. */
export const WRAP_MIN_HOURS = 0.5;

/** Planned stop time used for JoyRider and WrapRider delivery estimates. */
export const DELIVERY_MINUTES_PER_STOP = 15;

/** Planned drive speed used for JoyRider and WrapRider delivery estimates. */
export const DELIVERY_ASSUMED_MPH = 25;

/** WrapRider wrapping pay. Delivery hours are separate and use the hourly rate. */
export const WRAPRIDER_GIFT_CENTS = 250;

/**
 * WrapStar paid hours for one started window.
 * Clock time, including fractions, floored at half an hour and capped at gifts ÷ 12.
 * Missing clock time falls back to the pace cap (still floored at half an hour).
 */
export function paidWrapShiftHours(clockHours: number, finishedGifts: number): number {
  const gifts = Math.max(0, Math.floor(finishedGifts));
  if (gifts <= 0) return 0;
  const paceCap = gifts / 12;
  const clock = Number.isFinite(clockHours) && clockHours > 0 ? clockHours : paceCap;
  return Math.max(WRAP_MIN_HOURS, Math.min(clock, paceCap));
}

/**
 * Delivery pay hours from the plan, not from time on the road.
 * Traffic cannot change this number after the route is assigned.
 */
export function estimatedDeliveryHours(stops: number, miles: number): number {
  const n = Math.max(0, Math.floor(stops));
  if (n <= 0) return 0;
  const drive = Number.isFinite(miles) && miles > 0 ? miles / DELIVERY_ASSUMED_MPH : 0;
  return n * (DELIVERY_MINUTES_PER_STOP / 60) + drive;
}

export function amountCentsForHours(hours: number, hourlyRateCents: number): number {
  if (hours <= 0 || hourlyRateCents <= 0) return 0;
  return Math.round(hours * hourlyRateCents);
}
