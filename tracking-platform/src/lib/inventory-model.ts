import { addDays } from "date-fns";
import { formatInTimeZone, toDate } from "date-fns-tz";

const NY = "America/New_York";

export type InventoryNeed = {
  dateKey: string;
  personId: string;
  personName: string;
  role: "WrapStar" | "WrapRider" | "Unassigned";
  paper: string;
  /** Empty when the gift already has its own box. */
  boxSize: string;
  tissue: number;
};

export function sundayKeyNy(dateKey: string): string {
  const noon = toDate(`${dateKey}T12:00:00`, { timeZone: NY });
  const weekday = Number(formatInTimeZone(noon, NY, "i")); // 1 Mon … 7 Sun
  const sinceSunday = weekday % 7;
  return formatInTimeZone(addDays(noon, -sinceSunday), NY, "yyyy-MM-dd");
}

export function addDateKeys(dateKey: string, days: number): string {
  const noon = toDate(`${dateKey}T12:00:00`, { timeZone: NY });
  return formatInTimeZone(addDays(noon, days), NY, "yyyy-MM-dd");
}
