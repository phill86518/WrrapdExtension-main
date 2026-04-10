import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { toDate } from "date-fns-tz";
import { nowInNy } from "./ny-date";
import { promises as fs } from "fs";
import path from "path";
import type { DayShiftAvailability, WeekAvailabilityRecord } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "driver-availability.json");

const NY = "America/New_York";

type FileShape = { records: WeekAvailabilityRecord[] };
export type ShiftKey = "morning" | "afternoon";

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readFile(): Promise<FileShape> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as FileShape;
  } catch {
    return { records: [] };
  }
}

async function writeFile(data: FileShape) {
  await ensureDir();
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), "utf8");
}

/** Monday YYYY-MM-DD of the ISO week containing `date` (NY-local interpretation via calendar math on NY "now"). */
export function mondayOfWeekContaining(date: Date): string {
  const monday = startOfWeek(date, { weekStartsOn: 1 });
  return format(monday, "yyyy-MM-dd");
}

/**
 * Deadline: Saturday 10:00 America/New_York **before** the Monday that starts that work week.
 * If `now` is past that instant and the driver has not submitted for that week → unavailable (unless admin forced).
 */
export function availabilityDeadlineForWeekMonday(weekStartMonday: string): Date {
  const monday = parseISO(`${weekStartMonday}T12:00:00`);
  const saturdayBeforeMonday = addDays(monday, -2);
  const deadlineLocal = `${format(saturdayBeforeMonday, "yyyy-MM-dd")}T10:00:00`;
  return toDate(deadlineLocal, { timeZone: NY });
}

function recordForWeek(
  records: WeekAvailabilityRecord[],
  driverId: string,
  weekStartMonday: string
): WeekAvailabilityRecord | undefined {
  return records.find(
    (r) => r.driverId === driverId && r.weekStartMonday === weekStartMonday
  );
}

export async function submitWeekAvailability(
  driverId: string,
  weekStartMonday: string,
  days: Record<string, DayShiftAvailability>
): Promise<WeekAvailabilityRecord> {
  const data = await readFile();
  const rec: WeekAvailabilityRecord = {
    driverId,
    weekStartMonday,
    submittedAt: new Date().toISOString(),
    days,
  };
  data.records = data.records.filter(
    (r) => !(r.driverId === driverId && r.weekStartMonday === weekStartMonday)
  );
  data.records.push(rec);
  await writeFile(data);
  return rec;
}

export async function listWeekRecords(): Promise<WeekAvailabilityRecord[]> {
  const data = await readFile();
  return data.records;
}

export function upcomingWeekFromToday(): {
  weekStartMonday: string;
  days: string[];
} {
  const nyNow = nowInNy();
  const monday = startOfWeek(nyNow, { weekStartsOn: 1 });
  const weekStartMonday = format(monday, "yyyy-MM-dd");
  const days = Array.from({ length: 7 }, (_, i) =>
    format(addDays(monday, i), "yyyy-MM-dd")
  );
  return { weekStartMonday, days };
}

export async function getWeekAvailability(
  driverId: string,
  weekStartMonday: string
): Promise<WeekAvailabilityRecord | null> {
  const data = await readFile();
  const rec = recordForWeek(data.records, driverId, weekStartMonday);
  return rec ?? null;
}

function normalizeShifts(value: unknown): DayShiftAvailability {
  if (typeof value === "boolean") {
    return { morning: value, afternoon: value };
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Partial<DayShiftAvailability>;
    return {
      morning: obj.morning === true,
      afternoon: obj.afternoon === true,
    };
  }
  return { morning: false, afternoon: false };
}

/**
 * Effective availability for `dateKey` (YYYY-MM-DD in NY).
 * Before deadline without submission: treat as **available** (soft default for planning).
 * After deadline without submission: **unavailable** unless forced by admin.
 */
export async function isDriverAvailableOnDate(
  driverId: string,
  dateKey: string,
  shift: ShiftKey,
  now: Date = new Date(),
  forcedDates: string[] = []
): Promise<boolean> {
  if (forcedDates.includes(dateKey)) return true;
  const weekStart = mondayOfWeekContaining(parseISO(`${dateKey}T12:00:00`));
  const deadline = availabilityDeadlineForWeekMonday(weekStart);
  const data = await readFile();
  const rec = recordForWeek(data.records, driverId, weekStart);
  if (rec) {
    const shifts = normalizeShifts(rec.days[dateKey]);
    return shifts[shift] === true;
  }
  if (now.getTime() > deadline.getTime()) {
    return false;
  }
  return true;
}
