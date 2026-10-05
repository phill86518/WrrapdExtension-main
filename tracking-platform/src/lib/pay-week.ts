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

/** WrapStars and WrapRiders are paid $30.00 for every 12 finished wraps (pro-rated), plus a $15.00 bonus every 100 wraps. */
export const WRAP_DOZEN_CENTS = 3000;
export const WRAP_GIFTS_PER_DOZEN = 12;
export const WRAP_BONUS_EVERY = 100;
export const WRAP_BONUS_CENTS = 1500;

/** Planned stop time used for JoyRider and WrapRider delivery estimates (Amazon Flex-style). */
export const DELIVERY_MINUTES_PER_STOP = 15;

/** Planned drive speed used for JoyRider and WrapRider delivery estimates. */
export const DELIVERY_ASSUMED_MPH = 25;

/** @deprecated Use wrappingPayCents. Kept so older weekly rows still import. */
export const WRAPRIDER_GIFT_CENTS = Math.round(WRAP_DOZEN_CENTS / WRAP_GIFTS_PER_DOZEN);

/** Pay for finished wraps that meet published standards. Partial dozens are pro-rated. No pace reduction. */
export function wrappingPayCents(finishedGifts: number, dozenCents = WRAP_DOZEN_CENTS): number {
  const gifts = Math.max(0, Math.floor(finishedGifts));
  if (gifts <= 0 || dozenCents <= 0) return 0;
  return Math.round((gifts / WRAP_GIFTS_PER_DOZEN) * dozenCents);
}

/**
 * $15.00 for each 100-wrap milestone crossed between `giftsBefore` (exclusive) and `giftsBefore + giftsAdded`.
 * 95 then +20 this week → one bonus; 0 then +250 → two bonuses.
 */
export function wrappingMilestoneBonusCents(giftsBefore: number, giftsAdded: number): number {
  const before = Math.max(0, Math.floor(giftsBefore));
  const added = Math.max(0, Math.floor(giftsAdded));
  if (added <= 0) return 0;
  const after = before + added;
  const crossed = Math.floor(after / WRAP_BONUS_EVERY) - Math.floor(before / WRAP_BONUS_EVERY);
  return Math.max(0, crossed) * WRAP_BONUS_CENTS;
}

/** @deprecated Wrapping is no longer hourly. Returns 0. */
export function paidWrapShiftHours(_clockHours: number, _finishedGifts: number): number {
  return 0;
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
